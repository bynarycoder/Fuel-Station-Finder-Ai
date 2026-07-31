"""
``User`` model and the application role taxonomy.

Authentication itself (signup, login, password hashing, sessions) is delegated to
**Supabase Auth** — we never store or handle credentials. This table is the
backend's *mirror* of Supabase identities plus the application-specific data that
Supabase does not own: the user's **role** within this product.

Design decisions:

* ``id`` equals the Supabase ``auth.users.id`` UUID (carried in the JWT ``sub``
  claim). We therefore do **not** auto-generate it — it is supplied at JIT
  provisioning time. Using the Supabase id as the primary key means future
  relationships (e.g. report authorship) reference the real identity directly,
  with no extra mapping column.
* ``role`` uses ``native_enum=False`` so it is stored as a ``VARCHAR`` + a
  ``CHECK`` constraint. This keeps the column portable (works on SQLite for the
  test-suite as well as Postgres in production) and avoids the migration pain of
  native Postgres ``ENUM`` types when roles evolve.
"""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import Boolean, Enum as SAEnum, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin


class UserRole(str, enum.Enum):
    """Application-level roles. Supabase's own JWT ``role`` claim
    ("authenticated"/"anon"/"service_role") is a different concept used for Row
    Level Security and is *not* this enum."""

    DRIVER = "driver"
    STATION_MANAGER = "station_manager"
    ADMIN = "admin"

    @property
    def description(self) -> str:
        return _ROLE_DESCRIPTIONS[self]


_ROLE_DESCRIPTIONS: dict[UserRole, str] = {
    UserRole.DRIVER: (
        "Default role. Can search for fuel stations, view prices/queues and "
        "submit crowd-sourced fuel reports."
    ),
    UserRole.STATION_MANAGER: (
        "Manages one or more stations: updates official pricing, availability "
        "and responds to reports for their stations."
    ),
    UserRole.ADMIN: (
        "Full platform access: verifies/moderates reports, manages users and "
        "roles, and oversees station catalogue curation."
    ),
}


class User(TimestampMixin, Base):
    """A user of the Fuel Station Finder AI platform."""

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
    )

    # == Supabase auth.users.id (JWT ``sub``). Provided, never auto-generated.
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    role: Mapped[UserRole] = mapped_column(
        SAEnum(
            UserRole,
            native_enum=False,
            length=30,
            create_constraint=True,
            name="ck_users_role",
            # Store the lowercase enum *values* ('driver', ...) rather than the
            # member names, so the persisted role matches the public API.
            values_callable=lambda role_enum: [member.value for member in role_enum],
        ),
        nullable=False,
        default=UserRole.DRIVER,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<User id={self.id!s} email={self.email!r} role={self.role!r}>"
