"""report review workflow: under_review status + reviewer/rejection columns

Revision ID: 0010
Revises: 0009
Create Date: 2026-08-13

Completes the verification state machine on ``fuel_reports``:

    PENDING → UNDER_REVIEW → VERIFIED | REJECTED

* widens the ``ck_fuel_reports_status`` CHECK to admit ``under_review``;
* adds ``reviewed_by`` (the admin/moderator who decided, FK to ``users``),
  ``reviewed_at``, ``rejection_reason`` (public-safe, shown to the submitter)
  and ``reviewer_notes`` (moderation-only).

Existing reports are untouched: their status values are all already valid and
the new columns are nullable. Fully reversible; no station/report rows are
deleted or modified.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Widen the status CHECK constraint to admit 'under_review'.
    op.drop_constraint("ck_fuel_reports_status", "fuel_reports", type_="check")
    op.create_check_constraint(
        "ck_fuel_reports_status",
        "fuel_reports",
        "status IN ('pending', 'under_review', 'verified', 'rejected')",
    )

    # 2) Reviewer workflow columns.
    op.add_column(
        "fuel_reports",
        sa.Column("reviewed_by", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "fuel_reports",
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "fuel_reports",
        sa.Column("rejection_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "fuel_reports",
        sa.Column("reviewer_notes", sa.Text(), nullable=True),
    )
    op.create_foreign_key(
        "fk_fuel_reports_reviewed_by_users",
        "fuel_reports",
        "users",
        ["reviewed_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_fuel_reports_reviewed_at", "fuel_reports", ["reviewed_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_fuel_reports_reviewed_at", table_name="fuel_reports")
    op.drop_constraint(
        "fk_fuel_reports_reviewed_by_users", "fuel_reports", type_="foreignkey"
    )
    op.drop_column("fuel_reports", "reviewer_notes")
    op.drop_column("fuel_reports", "rejection_reason")
    op.drop_column("fuel_reports", "reviewed_at")
    op.drop_column("fuel_reports", "reviewed_by")

    op.drop_constraint("ck_fuel_reports_status", "fuel_reports", type_="check")
    op.create_check_constraint(
        "ck_fuel_reports_status",
        "fuel_reports",
        "status IN ('pending', 'verified', 'rejected')",
    )
