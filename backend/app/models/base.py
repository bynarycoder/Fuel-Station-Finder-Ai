"""
Shared declarative building blocks for all SQLAlchemy 2.0 models.

The ``TimestampMixin`` standardises audit columns (``created_at`` /
``updated_at``) across every domain table so that we never hand-roll
created/modified tracking on a per-table basis.
"""

from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column


class TimestampMixin:
    """
    Mixin that adds immutable ``created_at`` and auto-updating ``updated_at``
    timezone-aware timestamp columns to any model.

    ``server_default=func.now()`` guarantees a value even for raw SQL inserts
    (e.g. Alembic data migrations), while ``onupdate=func.now()`` keeps the
    ``updated_at`` column in sync whenever SQLAlchemy issues an ``UPDATE``.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
