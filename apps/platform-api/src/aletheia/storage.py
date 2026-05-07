"""
CoT content storage service for Aletheia.
Handles opt-in encrypted content storage and retrieval with per-tenant DEKs.
"""

import uuid

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.tiresias.encryption.envelope import EnvelopeEncryption
from src.tiresias.encryption.aead import encrypt_field, decrypt_field
from src.aletheia.models import AletheiaCoTChain, AletheiaCoTContent

logger = structlog.get_logger(__name__)


async def is_content_storage_enabled(session: AsyncSession, tenant_id: uuid.UUID) -> bool:
    """Check if a tenant has opted in to CoT content storage.

    Looks for tenant metadata JSON field: {"aletheia": {"store_cot_content": true}}.
    Defaults to False (hash-only mode) if not set or tenant not found.
    """
    try:
        from src.database.models import SoulTenant as Tenant
        result = await session.execute(
            select(Tenant.metadata_).where(Tenant.id == tenant_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            return False
        if not isinstance(row, dict):
            return False
        aletheia_cfg = row.get("aletheia", {})
        return bool(aletheia_cfg.get("store_cot_content", False))
    except Exception:
        logger.warning("cot_storage.opt_in_check_failed", tenant_id=str(tenant_id), exc_info=True)
        return False


class CotContentStorage:
    """Manages encrypted CoT content storage and retrieval."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession], envelope: EnvelopeEncryption):
        self.session_factory = session_factory
        self._envelope = envelope

    async def store_content(
        self,
        chain_entry_id: uuid.UUID,
        tenant_id: uuid.UUID,
        reasoning_text: str,
    ) -> bool:
        """Encrypt and store CoT reasoning content.

        Args:
            chain_entry_id: FK to aletheia_cot_chain.id.
            tenant_id: Tenant UUID for DEK derivation.
            reasoning_text: Raw reasoning text to encrypt.

        Returns:
            True on success, False on failure.
        """
        try:
            async with self.session_factory() as dek_session:
                dek = await self._envelope.get_or_create_dek(str(tenant_id), dek_session)
            # Use the same AES-256-GCM as the proxy (nonce || ciphertext+tag format)
            blob = encrypt_field(reasoning_text, dek)
            # Split into components for the existing DB schema
            nonce = blob[:12]
            ct_with_tag = blob[12:]
            ciphertext = ct_with_tag[:-16]
            tag = ct_with_tag[-16:]

            async with self.session_factory() as session:
                async with session.begin():
                    content = AletheiaCoTContent(
                        chain_entry_id=chain_entry_id,
                        tenant_id=tenant_id,
                        encrypted_content=ciphertext,
                        content_nonce=nonce,
                        content_tag=tag,
                    )
                    session.add(content)

                    # Update chain entry to reflect content is stored
                    await session.execute(
                        update(AletheiaCoTChain)
                        .where(AletheiaCoTChain.id == chain_entry_id)
                        .values(content_stored=True, content_ref=str(content.id))
                    )

            logger.debug(
                "cot_storage.content_stored",
                chain_entry_id=str(chain_entry_id),
                tenant_id=str(tenant_id),
                ciphertext_bytes=len(ciphertext),
            )
            return True

        except Exception:
            logger.error(
                "cot_storage.store_failed",
                chain_entry_id=str(chain_entry_id),
                tenant_id=str(tenant_id),
                exc_info=True,
            )
            return False

    async def retrieve_content(
        self,
        chain_entry_id: uuid.UUID,
        tenant_id: uuid.UUID,
    ) -> str | None:
        """Retrieve and decrypt CoT reasoning content.

        Args:
            chain_entry_id: FK to aletheia_cot_chain.id.
            tenant_id: Tenant UUID for DEK derivation.

        Returns:
            Decrypted plaintext string, or None if not found.
        """
        try:
            async with self.session_factory() as session:
                result = await session.execute(
                    select(AletheiaCoTContent)
                    .where(AletheiaCoTContent.chain_entry_id == chain_entry_id)
                )
                content_row = result.scalar_one_or_none()

            if content_row is None:
                return None

            async with self.session_factory() as dek_session:
                dek = await self._envelope.get_or_create_dek(str(tenant_id), dek_session)
            # Reassemble blob: nonce || ciphertext || tag
            blob = content_row.content_nonce + content_row.encrypted_content + content_row.content_tag
            return decrypt_field(blob, dek)

        except Exception:
            logger.error(
                "cot_storage.retrieve_failed",
                chain_entry_id=str(chain_entry_id),
                tenant_id=str(tenant_id),
                exc_info=True,
            )
            return None
