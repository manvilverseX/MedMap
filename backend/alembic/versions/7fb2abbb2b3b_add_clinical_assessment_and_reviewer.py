"""add_clinical_assessment_and_reviewer

Revision ID: 7fb2abbb2b3b
Revises: 9a0c652c7325
Create Date: 2026-09-27 18:58:59.872790

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7fb2abbb2b3b'
down_revision: Union[str, None] = '9a0c652c7325'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("cases", sa.Column("clinicalAssessment", sa.JSON(), nullable=True))
    op.add_column("cases", sa.Column("reviewerId", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("cases", "reviewerId")
    op.drop_column("cases", "clinicalAssessment")
