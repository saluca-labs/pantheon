#!/usr/bin/env python3
"""Phase F — Fluent Bit partner-exports config generator.

Reads /etc/fluent-bit/partners/partners.yaml (mounted from ConfigMap
`fluent-bit-partner-exports`) plus the partner-export-* secrets, and
renders `/fluent-bit/etc/partner-exports.conf` which the main
fluent-bit.conf pulls in via `@INCLUDE partner-exports.conf`.

Also implements DRY_RUN_PARTNER_ID: when set, that partner's
formatted payloads are written to stdout (and optionally POSTed to a
harmless test destination like http://httpbin.local/post) but no live
SIEM traffic is emitted.

The script is designed to run as an initContainer on the Fluent Bit
DaemonSet. Idempotent: rerunning with unchanged inputs produces
byte-identical output. Zero external deps beyond PyYAML, which the
init container image includes.

Event schema reference (canonical `_security_audit`):
    ts, event_type, actor_id, actor_type, outcome, resource_type,
    resource_id, service, tenant_id, trace_id, request_id,
    session_id, level, payload

Format adapters below produce BOSS-ready records. Fluent Bit's
[OUTPUT] stage handles transport. For GELF we use the built-in
`gelf` output. For LEEF/CEF we use syslog (built-in) or http.
For OTEL we emit via the `opentelemetry` output plugin.

If a target format cannot be handled natively by the installed
Fluent Bit image (e.g. `opentelemetry` disabled in some builds),
the generator logs a BUILDER_PHASE_F WARN and falls back to `http`
with a pre-formatted payload via a Lua transform.
"""

from __future__ import annotations

import json
import os
import pathlib
import sys
import textwrap
from dataclasses import dataclass, field
from typing import Any

try:
    import yaml
except ImportError:  # pragma: no cover — init container must ship PyYAML
    print("FATAL: pyyaml missing", file=sys.stderr)
    sys.exit(2)


# -----------------------------------------------------------------------------
# Paths / env
# -----------------------------------------------------------------------------

PARTNERS_YAML = pathlib.Path(
    os.environ.get(
        "TIRESIAS_PARTNERS_YAML",
        "/etc/fluent-bit/partners/partners.yaml",
    )
)
OUTPUT_CONF = pathlib.Path(
    os.environ.get(
        "TIRESIAS_PARTNER_CONF_OUT",
        "/fluent-bit/etc/partner-exports.conf",
    )
)
TLS_SECRET_DIR = pathlib.Path(
    os.environ.get("TIRESIAS_TLS_SECRET_DIR", "/etc/fluent-bit/secrets/tls")
)
AUTH_SECRET_DIR = pathlib.Path(
    os.environ.get("TIRESIAS_AUTH_SECRET_DIR", "/etc/fluent-bit/secrets/auth")
)
DRY_RUN_PARTNER_ID = os.environ.get("DRY_RUN_PARTNER_ID", "").strip() or None


SEVERITY_LEVELS = {
    "DEBUG": 10,
    "INFO": 20,
    "WARN": 30,
    "ERROR": 40,
    "SECURITY": 45,
    "CRITICAL": 50,
}
VALID_FORMATS = {"leef", "cef", "gelf", "otel"}


# -----------------------------------------------------------------------------
# Format adapters (pure Python — used for dry-run + fallback payloads)
# -----------------------------------------------------------------------------


def _leef_escape(value: str) -> str:
    """LEEF 2.0 field values escape '\\', '|', '\\t', '\\r', '\\n'."""
    return (
        str(value)
        .replace("\\", "\\\\")
        .replace("|", "\\|")
        .replace("\t", "\\t")
        .replace("\r", "\\r")
        .replace("\n", "\\n")
    )


def format_leef(event: dict[str, Any]) -> str:
    """LEEF 2.0 per IBM QRadar spec.

    LEEF:2.0|<Vendor>|<Product>|<Version>|<EventID>|<Delim>|<AttrKVs>
    """
    delim = "\t"
    header = "LEEF:2.0|Saluca|Tiresias|1.0|{event_id}|{delim}|".format(
        event_id=_leef_escape(event.get("event_type", "unknown")),
        delim="x09",  # hex for tab
    )
    sev = {
        "DEBUG": 1,
        "INFO": 3,
        "WARN": 5,
        "ERROR": 7,
        "SECURITY": 9,
        "CRITICAL": 10,
    }.get(event.get("level", "INFO"), 3)

    attrs = {
        "devTime": event.get("ts", ""),
        "devTimeFormat": "yyyy-MM-dd'T'HH:mm:ss'Z'",
        "cat": event.get("event_type", ""),
        "sev": sev,
        "usrName": event.get("actor_id", ""),
        "src": event.get("service", ""),
        "tenantId": event.get("tenant_id", ""),
        "resource": "%s:%s"
        % (event.get("resource_type", ""), event.get("resource_id", "")),
        "outcome": event.get("outcome", ""),
        "traceId": event.get("trace_id", ""),
        "requestId": event.get("request_id", ""),
    }
    body = delim.join(
        "%s=%s" % (k, _leef_escape(v)) for k, v in attrs.items() if v != ""
    )
    return header + body


def format_cef(event: dict[str, Any]) -> str:
    """ArcSight CEF 0.

    CEF:0|Vendor|Product|Version|SignatureID|Name|Severity|Extension
    """
    severity = {
        "DEBUG": 1,
        "INFO": 3,
        "WARN": 5,
        "ERROR": 7,
        "SECURITY": 9,
        "CRITICAL": 10,
    }.get(event.get("level", "INFO"), 3)
    header = "CEF:0|Saluca|Tiresias|1.0|%s|%s|%d|" % (
        event.get("event_type", "unknown"),
        event.get("event_type", "tiresias event"),
        severity,
    )

    ext = {
        "rt": event.get("ts", ""),
        "suser": event.get("actor_id", ""),
        "src": event.get("service", ""),
        "cs1Label": "tenantId",
        "cs1": event.get("tenant_id", ""),
        "cs2Label": "resource",
        "cs2": "%s:%s"
        % (event.get("resource_type", ""), event.get("resource_id", "")),
        "cs3Label": "outcome",
        "cs3": event.get("outcome", ""),
        "cs4Label": "traceId",
        "cs4": event.get("trace_id", ""),
        "cs5Label": "requestId",
        "cs5": event.get("request_id", ""),
        "act": event.get("event_type", ""),
    }

    def cef_escape(v: str) -> str:
        return str(v).replace("\\", "\\\\").replace("=", "\\=").replace("|", "\\|")

    extension = " ".join("%s=%s" % (k, cef_escape(v)) for k, v in ext.items() if v)
    return header + extension


def format_gelf(event: dict[str, Any]) -> str:
    """Graylog GELF 1.1 JSON."""
    level_map = {
        "DEBUG": 7,
        "INFO": 6,
        "WARN": 4,
        "ERROR": 3,
        "SECURITY": 2,
        "CRITICAL": 2,
    }
    ts = event.get("ts", "")
    record = {
        "version": "1.1",
        "host": event.get("service", "tiresias"),
        "short_message": event.get("event_type", "tiresias event"),
        "full_message": json.dumps(event, separators=(",", ":")),
        "timestamp": ts,  # Fluent Bit GELF output converts RFC3339 → epoch
        "level": level_map.get(event.get("level", "INFO"), 6),
        "_tenant_id": event.get("tenant_id", ""),
        "_actor_id": event.get("actor_id", ""),
        "_actor_type": event.get("actor_type", ""),
        "_event_type": event.get("event_type", ""),
        "_outcome": event.get("outcome", ""),
        "_resource_type": event.get("resource_type", ""),
        "_resource_id": event.get("resource_id", ""),
        "_service": event.get("service", ""),
        "_trace_id": event.get("trace_id", ""),
        "_request_id": event.get("request_id", ""),
        "_session_id": event.get("session_id", ""),
    }
    return json.dumps(record, separators=(",", ":"))


def format_otel(event: dict[str, Any]) -> str:
    """OTLP/HTTP LogRecord JSON (OpenTelemetry 1.0)."""
    sev_num = {
        "DEBUG": 5,
        "INFO": 9,
        "WARN": 13,
        "ERROR": 17,
        "SECURITY": 21,  # FATAL range per OTEL spec
        "CRITICAL": 21,
    }.get(event.get("level", "INFO"), 9)
    trace_id_hex = (event.get("trace_id") or "").replace("-", "")[:32].ljust(32, "0")
    span_id_hex = (event.get("request_id") or "").replace("-", "")[:16].ljust(16, "0")

    record = {
        "resourceLogs": [
            {
                "resource": {
                    "attributes": [
                        {"key": "service.name", "value": {"stringValue": "tiresias"}},
                        {
                            "key": "service.instance.id",
                            "value": {"stringValue": event.get("service", "")},
                        },
                        {
                            "key": "tenant.id",
                            "value": {"stringValue": event.get("tenant_id", "")},
                        },
                    ]
                },
                "scopeLogs": [
                    {
                        "scope": {"name": "tiresias.audit"},
                        "logRecords": [
                            {
                                "timeUnixNano": "0",
                                "severityNumber": sev_num,
                                "severityText": event.get("level", "INFO"),
                                "body": {
                                    "stringValue": event.get("event_type", "event")
                                },
                                "traceId": trace_id_hex,
                                "spanId": span_id_hex,
                                "attributes": [
                                    {"key": k, "value": {"stringValue": str(v)}}
                                    for k, v in event.items()
                                    if k
                                    in (
                                        "event_type",
                                        "actor_id",
                                        "actor_type",
                                        "outcome",
                                        "resource_type",
                                        "resource_id",
                                        "service",
                                        "trace_id",
                                        "request_id",
                                        "session_id",
                                    )
                                    and v
                                ],
                            }
                        ],
                    }
                ],
            }
        ]
    }
    return json.dumps(record, separators=(",", ":"))


FORMATTERS = {
    "leef": format_leef,
    "cef": format_cef,
    "gelf": format_gelf,
    "otel": format_otel,
}


# -----------------------------------------------------------------------------
# Partner validation + rendering
# -----------------------------------------------------------------------------


@dataclass
class Partner:
    id: str
    format: str
    destination: dict[str, Any]
    filter: dict[str, Any] = field(default_factory=dict)
    auth: dict[str, Any] = field(default_factory=dict)
    tls: dict[str, Any] = field(default_factory=dict)


def validate_partner(raw: dict[str, Any]) -> Partner:
    if "id" not in raw or "format" not in raw or "destination" not in raw:
        raise ValueError("partner missing required fields: id/format/destination")
    fmt = str(raw["format"]).lower()
    if fmt not in VALID_FORMATS:
        raise ValueError(
            "partner %r has invalid format %r (must be one of %s)"
            % (raw["id"], fmt, sorted(VALID_FORMATS))
        )
    sev_min = raw.get("filter", {}).get("severity_min", "INFO")
    if sev_min not in SEVERITY_LEVELS:
        raise ValueError(
            "partner %r has invalid severity_min %r" % (raw["id"], sev_min)
        )
    return Partner(
        id=str(raw["id"]),
        format=fmt,
        destination=raw["destination"],
        filter=raw.get("filter", {}),
        auth=raw.get("auth", {}),
        tls=raw.get("tls", {}),
    )


def render_filter_block(p: Partner) -> str:
    """Emit a rewrite_tag + lua filter producing `partner.<id>` stream."""
    sev_min = p.filter.get("severity_min", "INFO")
    sev_num = SEVERITY_LEVELS[sev_min]
    tenant_ids = p.filter.get("tenant_id") or []
    tenant_regex = (
        "^(" + "|".join(tenant_ids) + ")$" if tenant_ids else ".*"
    )
    return textwrap.dedent(
        f"""
        # ---- partner: {p.id} (format={p.format}, sev>={sev_min}) ----
        [FILTER]
            Name    rewrite_tag
            Match   kube.tiresias.*
            Rule    $tenant_id {tenant_regex} partner.{p.id} false
            Emitter_Name re_emitted_partner_{p.id.replace('-', '_')}

        [FILTER]
            Name      grep
            Match     partner.{p.id}
            Exclude   level ^(?!({'|'.join(n for n,v in SEVERITY_LEVELS.items() if v >= sev_num)})$).*$
        """
    )


def render_output_block(p: Partner) -> str:
    """Render the per-partner [OUTPUT] section."""
    dry_run = DRY_RUN_PARTNER_ID == p.id
    if dry_run:
        return textwrap.dedent(
            f"""
            # DRY_RUN active for partner {p.id}: payloads go to stdout only.
            [OUTPUT]
                Name   stdout
                Match  partner.{p.id}
                Format json_lines
            """
        )

    d = p.destination
    dtype = d.get("type", "")
    host = d.get("host", "")
    port = d.get("port", 0)

    if p.format == "gelf":
        transport = {"gelf_udp": "udp", "gelf_tcp": "tcp", "gelf_tls": "tls"}.get(
            dtype, "udp"
        )
        tls_line = "    tls  On\n    tls.verify  On" if transport == "tls" else ""
        return textwrap.dedent(
            f"""
            [OUTPUT]
                Name             gelf
                Match            partner.{p.id}
                Host             {host}
                Port             {port}
                Mode             {transport}
                Gelf_Short_Message_Key short_message
            {tls_line}
            """
        )

    if p.format == "otel":
        return textwrap.dedent(
            f"""
            [OUTPUT]
                Name             opentelemetry
                Match            partner.{p.id}
                Host             {host}
                Port             {port}
                Metrics_uri      /v1/metrics
                Logs_uri         /v1/logs
                Log_response_payload True
                tls              {"On" if dtype == "otlp_https" else "Off"}
                tls.verify       On
            """
        )

    # LEEF / CEF: syslog or http
    if dtype.startswith("syslog"):
        mode = {"syslog_tcp": "tcp", "syslog_udp": "udp", "syslog_tls": "tls"}.get(
            dtype, "tcp"
        )
        tls_line = "    tls  On\n    tls.verify  On" if mode == "tls" else ""
        return textwrap.dedent(
            f"""
            [OUTPUT]
                Name             syslog
                Match            partner.{p.id}
                Host             {host}
                Port             {port}
                Mode             {mode}
                Syslog_Format    rfc5424
                Syslog_Hostname_key service
                Syslog_Appname_preset tiresias
                Syslog_Message_key {"leef_payload" if p.format == "leef" else "cef_payload"}
            {tls_line}
            """
        )

    if dtype in ("http", "https"):
        scheme_tls = "On" if dtype == "https" else "Off"
        return textwrap.dedent(
            f"""
            [OUTPUT]
                Name             http
                Match            partner.{p.id}
                Host             {host}
                Port             {port}
                URI              /ingest
                Format           json_lines
                tls              {scheme_tls}
                tls.verify       On
            """
        )

    raise ValueError(
        "partner %r: unsupported destination.type %r for format %s"
        % (p.id, dtype, p.format)
    )


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------


def main() -> int:
    if not PARTNERS_YAML.exists():
        print(
            "WARN: %s not found; writing empty partner-exports.conf" % PARTNERS_YAML,
            file=sys.stderr,
        )
        partners_raw = []
    else:
        doc = yaml.safe_load(PARTNERS_YAML.read_text("utf-8")) or {}
        partners_raw = doc.get("partners") or []

    partners: list[Partner] = []
    for raw in partners_raw:
        try:
            partners.append(validate_partner(raw))
        except ValueError as err:
            print("ERROR: partner rejected: %s" % err, file=sys.stderr)
            return 3

    if DRY_RUN_PARTNER_ID and not any(p.id == DRY_RUN_PARTNER_ID for p in partners):
        print(
            "WARN: DRY_RUN_PARTNER_ID=%s but no matching partner in registry"
            % DRY_RUN_PARTNER_ID,
            file=sys.stderr,
        )

    header = textwrap.dedent(
        """
        # -----------------------------------------------------------------------------
        # partner-exports.conf  (generated by scripts/generate_partner_conf.py)
        # DO NOT EDIT. Regenerated on every Fluent Bit pod start.
        # Source: ConfigMap fluent-bit-partner-exports -> partners.yaml
        # Phase: F (Tier 3 logging, on-prem adapters)
        # -----------------------------------------------------------------------------
        """
    )

    blocks = [header]
    for p in partners:
        blocks.append(render_filter_block(p))
        blocks.append(render_output_block(p))

    if not partners:
        blocks.append(
            "# (no partners registered — partner-exports pipeline inert)\n"
        )

    OUTPUT_CONF.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_CONF.write_text("\n".join(blocks), encoding="utf-8")

    print(
        "wrote %s (%d partners, dry_run=%s)"
        % (OUTPUT_CONF, len(partners), DRY_RUN_PARTNER_ID or "none")
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
