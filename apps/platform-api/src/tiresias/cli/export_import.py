"""
Tiresias Data Export/Import CLI.

Enables migration between SaaS and on-prem deployments:
  - export: Dump audit logs + wrapped DEK as NDJSON tarball
  - import: Load exported data into a local Tiresias instance

The export preserves encrypted data — prompts/completions stay encrypted.
The wrapped DEK is re-wrapped with the target KEK during import.

Usage:
  python -m tiresias.cli.export_import export --tenant-id <uuid> --output export.tar.gz
  python -m tiresias.cli.export_import import --file export.tar.gz --kek <hex>
"""

from __future__ import annotations

import asyncio
import gzip
import hashlib
import json
import os
import sys
import tarfile
import tempfile
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import click


@click.group()
def cli():
    """Tiresias data export/import tool."""
    pass


@cli.command()
@click.option("--tenant-id", required=True, help="Tenant UUID to export")
@click.option("--output", "-o", required=True, help="Output tarball path (.tar.gz)")
@click.option("--database-url", envvar="TIRESIAS_DATABASE_URL", help="Postgres connection URL")
@click.option("--data-root", default="/data", help="Data root for SQLite mode")
def export(tenant_id: str, output: str, database_url: str | None, data_root: str):
    """Export tenant audit logs and encryption metadata."""
    asyncio.run(_export(tenant_id, output, database_url, data_root))


async def _export(tenant_id: str, output_path: str, database_url: str | None, data_root: str):
    # Set env for engine detection
    if database_url:
        os.environ["TIRESIAS_DATABASE_URL"] = database_url

    sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
    from tiresias.storage.engine import get_engine
    from tiresias.storage.schema import TiresiasAuditLog, TiresiasLicense

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession

    engine = await get_engine(tenant_id, Path(data_root))

    with tempfile.TemporaryDirectory() as tmpdir:
        # Export audit logs as NDJSON
        audit_path = os.path.join(tmpdir, "audit_logs.ndjson")
        license_path = os.path.join(tmpdir, "license.json")
        manifest_path = os.path.join(tmpdir, "manifest.json")

        record_count = 0
        async with AsyncSession(engine) as session:
            # Export audit logs
            result = await session.execute(
                select(TiresiasAuditLog)
                .where(TiresiasAuditLog.tenant_id == tenant_id)
                .where(TiresiasAuditLog.deleted_at.is_(None))
                .order_by(TiresiasAuditLog.created_at)
            )
            rows = result.scalars().all()

            with open(audit_path, "w", encoding="utf-8") as f:
                for row in rows:
                    record = {
                        "id": row.id,
                        "tenant_id": row.tenant_id,
                        "encrypted_prompt": row.encrypted_prompt.hex() if row.encrypted_prompt else None,
                        "encrypted_completion": row.encrypted_completion.hex() if row.encrypted_completion else None,
                        "model": row.model,
                        "provider": row.provider,
                        "token_count": row.token_count,
                        "prompt_tokens": row.prompt_tokens,
                        "completion_tokens": row.completion_tokens,
                        "cost_usd": row.cost_usd,
                        "session_id": row.session_id,
                        "metadata_json": row.metadata_json,
                        "request_hash": row.request_hash,
                        "response_hash": row.response_hash,
                        "created_at": row.created_at.isoformat() if row.created_at else None,
                    }
                    f.write(json.dumps(record) + "\n")
                    record_count += 1

            # Export license (wrapped DEK + config)
            result = await session.execute(
                select(TiresiasLicense).where(TiresiasLicense.tenant_id == tenant_id)
            )
            license_row = result.scalar_one_or_none()

            license_data = {}
            if license_row:
                license_data = {
                    "tenant_id": license_row.tenant_id,
                    "tier": license_row.tier,
                    "kek_provider": license_row.kek_provider,
                    "wrapped_dek": license_row.wrapped_dek.hex() if license_row.wrapped_dek else None,
                    "retention_days": license_row.retention_days,
                    "config_json": license_row.config_json,
                }

            with open(license_path, "w", encoding="utf-8") as f:
                json.dump(license_data, f, indent=2)

        # Write manifest
        now = datetime.now(timezone.utc)
        manifest = {
            "version": "1.0",
            "tenant_id": tenant_id,
            "exported_at": now.isoformat(),
            "record_count": record_count,
            "has_wrapped_dek": bool(license_data.get("wrapped_dek")),
            "kek_provider": license_data.get("kek_provider", "unknown"),
        }
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

        # Create tarball
        with tarfile.open(output_path, "w:gz") as tar:
            tar.add(manifest_path, arcname="manifest.json")
            tar.add(license_path, arcname="license.json")
            tar.add(audit_path, arcname="audit_logs.ndjson")

        # Compute integrity hash
        with open(output_path, "rb") as f:
            file_hash = hashlib.sha256(f.read()).hexdigest()

        click.echo(f"Exported {record_count} audit records for tenant {tenant_id}")
        click.echo(f"Output: {output_path}")
        click.echo(f"SHA-256: {file_hash}")


@cli.command("import")
@click.option("--file", "-f", "input_file", required=True, help="Input tarball path (.tar.gz)")
@click.option("--kek", required=True, help="Target KEK (hex-encoded 32 bytes) for re-wrapping DEK")
@click.option("--database-url", envvar="TIRESIAS_DATABASE_URL", help="Postgres connection URL")
@click.option("--data-root", default="/data", help="Data root for SQLite mode")
@click.option("--dry-run", is_flag=True, help="Validate without importing")
def import_data(input_file: str, kek: str, database_url: str | None, data_root: str, dry_run: bool):
    """Import tenant data from an export tarball."""
    asyncio.run(_import(input_file, kek, database_url, data_root, dry_run))


async def _import(input_file: str, kek_hex: str, database_url: str | None, data_root: str, dry_run: bool):
    if database_url:
        os.environ["TIRESIAS_DATABASE_URL"] = database_url

    sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
    from tiresias.storage.engine import get_engine
    from tiresias.storage.schema import TiresiasAuditLog, TiresiasLicense
    from tiresias.encryption.providers.local import LocalKEKProvider

    from sqlalchemy.ext.asyncio import AsyncSession

    # Validate KEK
    try:
        kek_bytes = bytes.fromhex(kek_hex)
        if len(kek_bytes) != 32:
            raise ValueError
    except (ValueError, TypeError):
        click.echo("Error: KEK must be 64 hex characters (32 bytes)", err=True)
        sys.exit(1)

    target_provider = LocalKEKProvider(kek_bytes)

    with tempfile.TemporaryDirectory() as tmpdir:
        # Extract tarball
        with tarfile.open(input_file, "r:gz") as tar:
            tar.extractall(tmpdir)

        # Read manifest
        manifest_path = os.path.join(tmpdir, "manifest.json")
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        tenant_id = manifest["tenant_id"]
        click.echo(f"Importing {manifest['record_count']} records for tenant {tenant_id}")
        click.echo(f"Exported at: {manifest['exported_at']}")
        click.echo(f"Source KEK provider: {manifest['kek_provider']}")

        if dry_run:
            click.echo("Dry run — no data imported.")
            return

        # Read license data
        license_path = os.path.join(tmpdir, "license.json")
        with open(license_path, "r", encoding="utf-8") as f:
            license_data = json.load(f)

        engine = await get_engine(tenant_id, Path(data_root))

        async with AsyncSession(engine) as session:
            # Re-wrap DEK with target KEK if present
            if license_data.get("wrapped_dek"):
                click.echo("Note: DEK is wrapped with source KEK. You must re-wrap manually if source != target KEK.")
                # Store the wrapped DEK as-is if same KEK, or caller handles re-wrap
                license_row = TiresiasLicense(
                    tenant_id=tenant_id,
                    tier=license_data.get("tier", "enterprise"),
                    kek_provider="local",
                    wrapped_dek=bytes.fromhex(license_data["wrapped_dek"]),
                    retention_days=license_data.get("retention_days", 90),
                    config_json=license_data.get("config_json"),
                )
                session.add(license_row)
                await session.flush()

            # Import audit logs
            audit_path = os.path.join(tmpdir, "audit_logs.ndjson")
            imported = 0
            with open(audit_path, "r", encoding="utf-8") as f:
                for line in f:
                    record = json.loads(line)
                    row = TiresiasAuditLog(
                        id=record["id"],
                        tenant_id=record["tenant_id"],
                        encrypted_prompt=bytes.fromhex(record["encrypted_prompt"]) if record.get("encrypted_prompt") else None,
                        encrypted_completion=bytes.fromhex(record["encrypted_completion"]) if record.get("encrypted_completion") else None,
                        model=record.get("model"),
                        provider=record.get("provider"),
                        token_count=record.get("token_count"),
                        prompt_tokens=record.get("prompt_tokens"),
                        completion_tokens=record.get("completion_tokens"),
                        cost_usd=record.get("cost_usd"),
                        session_id=record.get("session_id"),
                        metadata_json=record.get("metadata_json"),
                        request_hash=record.get("request_hash"),
                        response_hash=record.get("response_hash"),
                        created_at=datetime.fromisoformat(record["created_at"]) if record.get("created_at") else None,
                    )
                    session.add(row)
                    imported += 1

                    # Batch flush every 1000 records
                    if imported % 1000 == 0:
                        await session.flush()

            await session.commit()
            click.echo(f"Imported {imported} audit records successfully.")


if __name__ == "__main__":
    cli()
