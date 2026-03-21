"""
Linear issue creation for support tickets.

Creates a Linear issue in the SAL team with severity labels
when a support ticket is submitted. Adds the Linear issue URL
to the Telegram notification.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

import httpx
import structlog

from config.settings import get_settings

if TYPE_CHECKING:
    from src.support.models import TicketResponse

logger = structlog.get_logger(__name__)

LINEAR_API = "https://api.linear.app/graphql"

TEAM_ID = "03ee70b4-ed03-4305-a3ae-4556afb06b04"

SEVERITY_LABEL_IDS = {
    "p0": "f7a98a53-8b57-4cd8-a467-6a7af67e8d06",
    "p1": "8bf3c476-cf8e-4a7d-beed-a9f031817ca7",
    "p2": "33251ecf-888b-454c-a4cb-99ff6f1b4a55",
    "p3": "8918b626-2310-49e6-af07-7e2834d5a15e",
}

SUPPORT_LABEL_ID = "b204a216-38fd-4fa8-859a-9814fa91faf5"

CATEGORY_LABEL_MAP = {
    "bug": "246afeba-1784-47c2-9d47-ba9c781755af",
    "security": "c7bc13da-b157-43e9-a211-64c4e48a9f8c",
    "feature": "7083c3a4-6eb0-4dfe-a02d-d2a7f41cd742",
}

PRIORITY_MAP = {
    "p0": 1,  # Urgent
    "p1": 2,  # High
    "p2": 3,  # Medium
    "p3": 4,  # Low
}


async def create_linear_issue(
    ticket: "TicketResponse",
    tenant_name: str,
) -> Optional[str]:
    """
    Create a Linear issue for a support ticket.
    Returns the issue URL if successful, None on failure.
    """
    settings = get_settings()
    api_key = getattr(settings, "linear_api_key", None)
    if not api_key:
        import os
        api_key = os.environ.get("LINEAR_API_KEY") or os.environ.get("SOULAUTH_LINEAR_API_KEY")

    if not api_key:
        logger.warning(
            "support.linear_skipped",
            reason="LINEAR_API_KEY not configured",
            ticket_id=ticket.ticket_id,
        )
        return None

    label_ids = [SUPPORT_LABEL_ID]
    sev_label = SEVERITY_LABEL_IDS.get(ticket.severity)
    if sev_label:
        label_ids.append(sev_label)
    cat_label = CATEGORY_LABEL_MAP.get(ticket.category)
    if cat_label:
        label_ids.append(cat_label)

    priority = PRIORITY_MAP.get(ticket.severity, 3)

    title = f"[{ticket.severity.upper()}] {ticket.subject}"
    if tenant_name and tenant_name != "Unknown":
        title = f"[{ticket.severity.upper()}] [{tenant_name}] {ticket.subject}"

    description = (
        f"**Ticket ID:** TIR-{ticket.ticket_id}\n"
        f"**Severity:** {ticket.severity.upper()}\n"
        f"**Category:** {ticket.category}\n"
        f"**Tenant:** {tenant_name}\n"
        f"**SLA Deadline:** {ticket.sla_deadline}\n"
        f"**Created:** {ticket.created_at}\n\n"
        f"---\n\n"
        f"{ticket.description}"
    )

    label_ids_str = ", ".join(f'"' + lid + f'"' for lid in label_ids)

    query = """
    mutation CreateSupportIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          url
        }
      }
    }
    """

    variables = {
        "input": {
            "teamId": TEAM_ID,
            "title": title,
            "description": description,
            "priority": priority,
            "labelIds": label_ids,
        }
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                LINEAR_API,
                json={"query": query, "variables": variables},
                headers={
                    "Authorization": api_key,
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        result = data.get("data", {}).get("issueCreate", {})
        if result.get("success"):
            issue = result["issue"]
            logger.info(
                "support.linear_issue_created",
                ticket_id=ticket.ticket_id,
                linear_id=issue["identifier"],
                linear_url=issue["url"],
            )
            return issue["url"]
        else:
            errors = data.get("errors", [])
            logger.warning(
                "support.linear_create_failed",
                ticket_id=ticket.ticket_id,
                errors=errors,
            )
            return None

    except Exception as exc:
        logger.warning(
            "support.linear_error",
            ticket_id=ticket.ticket_id,
            error=str(exc),
        )
        return None
