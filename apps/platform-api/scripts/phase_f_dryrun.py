#!/usr/bin/env python3
"""Phase F dry-run harness.

Feeds a synthetic `_security_audit` event through all four format
adapters and writes the rendered payloads to
`.planning/tiresias-deep-audit-2026-04-14/phase_f_dryrun_samples.txt`.

Also generates a sample partner registry (3 partners, one per
transport family), runs generate_partner_conf.py against it in
DRY_RUN mode, and pretty-prints the resulting partner-exports.conf.
"""

from __future__ import annotations

import json
import os
import pathlib
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from generate_partner_conf import (  # type: ignore  # noqa: E402
    format_cef,
    format_gelf,
    format_leef,
    format_otel,
)


SAMPLE_EVENT = {
    "ts": "2026-04-15T22:17:04Z",
    "event_type": "auth.soulkey.denied",
    "level": "SECURITY",
    "actor_id": "sk_agent_saluca_twin_a_001_abcd1234",
    "actor_type": "service",
    "outcome": "blocked",
    "resource_type": "endpoint",
    "resource_id": "/v1/chat/completions",
    "service": "tiresias-proxy",
    "tenant_id": "00000001-0000-4000-a001-000000000001",
    "trace_id": "6f8c9a2e-31b7-4c88-a0d3-9e2f4b1c5a77",
    "request_id": "req-7f3b1d9e2a4c",
    "session_id": "sess-alfred-main",
    "payload": {
        "reason": "revoked_key",
        "client_ip": "[REDACTED:ipv4_private]",
        "user_email": "[REDACTED:email]",
    },
}


def main() -> int:
    out_path = pathlib.Path(
        os.environ.get(
            "PHASE_F_SAMPLES_OUT",
            r"Z:/_planning/tiresias-deep-audit-2026-04-14/phase_f_dryrun_samples.txt",
        )
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    lines.append("# Phase F dry-run sample payloads")
    lines.append("# Input event:")
    lines.append(json.dumps(SAMPLE_EVENT, indent=2))
    lines.append("")

    for name, fn in (
        ("LEEF 2.0", format_leef),
        ("CEF 0", format_cef),
        ("GELF 1.1", format_gelf),
        ("OTEL OTLP/HTTP", format_otel),
    ):
        payload = fn(SAMPLE_EVENT)
        lines.append(f"## {name}")
        lines.append(payload)
        lines.append("")

    # Exercise the generator against a 3-partner sample registry.
    registry = {
        "partners": [
            {
                "id": "sample-leef-qradar",
                "format": "leef",
                "destination": {
                    "type": "syslog_tls",
                    "host": "qradar.example.test",
                    "port": 6514,
                },
                "filter": {"severity_min": "INFO"},
            },
            {
                "id": "sample-gelf-graylog",
                "format": "gelf",
                "destination": {
                    "type": "gelf_udp",
                    "host": "graylog.example.test",
                    "port": 12201,
                },
                "filter": {"severity_min": "WARN"},
            },
            {
                "id": "sample-otel-collector",
                "format": "otel",
                "destination": {
                    "type": "otlp_http",
                    "host": "otel.example.test",
                    "port": 4318,
                },
                "filter": {"severity_min": "SECURITY"},
            },
        ]
    }

    with tempfile.TemporaryDirectory() as tmp:
        reg_path = pathlib.Path(tmp) / "partners.yaml"
        conf_path = pathlib.Path(tmp) / "partner-exports.conf"
        import yaml  # noqa: WPS433

        reg_path.write_text(yaml.safe_dump(registry), encoding="utf-8")

        os.environ["TIRESIAS_PARTNERS_YAML"] = str(reg_path)
        os.environ["TIRESIAS_PARTNER_CONF_OUT"] = str(conf_path)
        os.environ["DRY_RUN_PARTNER_ID"] = "sample-leef-qradar"

        import importlib

        import generate_partner_conf

        importlib.reload(generate_partner_conf)
        rc = generate_partner_conf.main()
        if rc != 0:
            print(f"generator failed rc={rc}", file=sys.stderr)
            return rc

        lines.append("## generated partner-exports.conf (3 sample partners)")
        lines.append(conf_path.read_text("utf-8"))

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
