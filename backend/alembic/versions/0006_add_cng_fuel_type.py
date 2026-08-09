"""add CNG fuel type (enum, constraint, seed row)

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-09

Adds Compressed Natural Gas (CNG) to the canonical fuel catalogue:

* widens the ``ck_fuel_types_code_domain`` check constraint to include 'CNG'
* inserts the CNG reference row (idempotent upsert)

Safe on both Postgres (Render/Supabase) and in Alembic offline (``--sql``) mode.
The constraint is recreated rather than altered-in-place because the canonical
name (``ck_fuel_types_code_domain``) must stay stable for the ORM metadata.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Replace the domain check constraint to admit CNG.
    op.drop_constraint("ck_fuel_types_code_domain", "fuel_types", type_="check")
    op.create_check_constraint(
        "ck_fuel_types_code_domain",
        "fuel_types",
        "code IN ('PMS', 'AGO', 'DPK', 'LPG', 'CNG')",
    )

    # 2) Insert the CNG reference row (idempotent).
    op.execute(
        """
        INSERT INTO fuel_types (code, name, description, is_active, created_at, updated_at)
        SELECT 'CNG',
               'Compressed Natural Gas',
               'Autogas (CNG) — cleaner alternative fuel for vehicles, expanding across Nigerian corridors.',
               TRUE,
               now(),
               now()
        WHERE NOT EXISTS (SELECT 1 FROM fuel_types WHERE code = 'CNG')
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM fuel_types WHERE code = 'CNG'")
    op.drop_constraint("ck_fuel_types_code_domain", "fuel_types", type_="check")
    op.create_check_constraint(
        "ck_fuel_types_code_domain",
        "fuel_types",
        "code IN ('PMS', 'AGO', 'DPK', 'LPG')",
    )
