"""Add intake answers to cases

Revision ID: 8c2f1b7d9a4e
Revises: 7e668cf6df52
Create Date: 2026-09-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8c2f1b7d9a4e'
down_revision: Union[str, None] = '7e668cf6df52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('cases', sa.Column('intakeAnswers', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('cases', 'intakeAnswers')
