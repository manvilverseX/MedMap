"""Add derived clinical data to cases

Revision ID: b6a1d4e8c2f9
Revises: 7fb2abbb2b3b
Create Date: 2026-09-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b6a1d4e8c2f9"
down_revision: Union[str, None] = "7fb2abbb2b3b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "cases",
        sa.Column("derivedClinicalData", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("cases", "derivedClinicalData")
