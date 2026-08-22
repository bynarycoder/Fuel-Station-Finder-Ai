"""
Alembic migration environment.

The database URL is taken from the application settings (the single source of
truth), so credentials never live in version-controlled ``alembic.ini``. The
target metadata is the ORM's own ``Base.metadata`` (built from the models in
``app.models``), which keeps migrations and the ORM strictly in sync.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

# Importing ``app.models`` registers every model on ``Base.metadata``.
from app.core.config import settings
from app.core.database import Base, build_sync_connect_args
import app.models  # noqa: F401

# alembic.ini Configuration object (provides access to the [alembic] section).
config = context.config

# Honour alembic.ini logging config when present.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Inject the live database URL from application settings.
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Single source of truth for "what the schema should look like".
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """
    Emit SQL to stdout without connecting to a database.

    Useful for reviewing migrations (``alembic upgrade head --sql``) and in CI
    environments without a live Postgres/PostGIS instance.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live database connection.

    The engine is built from ``settings.DATABASE_URL`` (not alembic.ini) so
    production credentials never live in git, and Supabase TLS is applied
    the same way as the application sync engine.
    """
    connectable = create_engine(
        settings.DATABASE_URL,
        poolclass=pool.NullPool,
        connect_args=build_sync_connect_args(settings.DATABASE_URL),
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
