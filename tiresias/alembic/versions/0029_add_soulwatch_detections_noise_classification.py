"""Add noise_classification column to _soulwatch_detections for B7-FIX-HEALTH-PROBE-NOISE

Marks historical k8s health-probe false-positive detections that accumulated
before the sigma engine filter was deployed.  Preserves the audit trail while
allowing portal/API callers to exclude known-noise rows by default.

Revision ID: 0029
Revises: 0028
Create Date: 2026-04-14
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0029"
down_revision: str = "0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Classification value written to all pre-fix health-probe detection rows.
_NOISE_LABEL = "legacy_health_probe_noise"


def upgrade() -> None:
    # 1. Add nullable column (no default — NULL means "real detection").
    op.add_column(
        "_soulwatch_detections",
        sa.Column(
            "noise_classification",
            sa.String(length=64),
            nullable=True,
            comment=(
                "Set to a non-null label for known-false-positive rows. "
                "NULL means the row is a genuine detection. "
                "Values: legacy_health_probe_noise, ..."
            ),
        ),
    )

    # 2. Back-fill: mark all nil-UUID tenant rows whose event_data indicates
    #    a health-check probe as legacy noise.
    #    Condition: tenant_id = nil UUID AND event_data->>'resource' = 'health_check'.
    op.execute(
        sa.text(
            """
            UPDATE _soulwatch_detections
            SET    noise_classification = :label
            WHERE  tenant_id = '00000000-0000-0000-0000-000000000000'
              AND  (
                       event_data->>'resource' = 'health_check'
                    OR event_data->>'action'   = 'probe'
                    OR matched_fields::text LIKE '%health_check%'
                   )
            """
        ).bindparams(label=_NOISE_LABEL)
    )

    # 3. Partial index so portal queries with noise_classification IS NULL
    #    stay fast even as the table grows.
    op.create_index(
        "idx_soulwatch_detections_noise",
        "_soulwatch_detections",
        ["noise_classification"],
        postgresql_where=sa.text("noise_classification IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("idx_soulwatch_detections_noise", table_name="_soulwatch_detections")
    op.drop_column("_soulwatch_detections", "noise_classification")
