"""Add translation_cache table

Revision ID: f3a1b2c4d5e6
Revises: bec8ee7f527c
Create Date: 2026-10-19 19:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f3a1b2c4d5e6'
down_revision: Union[str, None] = 'bec8ee7f527c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'translation_cache',
        sa.Column('source_text_hash', sa.String(64), nullable=False),
        sa.Column('target_lang', sa.String(8), nullable=False),
        sa.Column('translated_text', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('source_text_hash', 'target_lang'),
    )


def downgrade() -> None:
    op.drop_table('translation_cache')
