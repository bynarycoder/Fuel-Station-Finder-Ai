"""add ai_confidence_score to fuel_reports

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-09

Adds ``ai_confidence_score`` (NUMERIC(4,3), 0..1) to ``fuel_reports`` so the
Gemini verification score is persisted and can be surfaced anywhere the report
appears (station detail, feeds, admin) without re-running the model.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "fuel_reports",
        sa.Column("ai_confidence_score", sa.Numeric(4, 3), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("fuel_reports", "ai_confidence_score")
