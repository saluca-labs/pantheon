"""
Alembic environment configuration for the local-auth tree.

Resolution order for the database URL:
  1. ``DATABASE_URL`` environment variable (production / CI)
  2. ``sqlalchemy.url`` from alembic.ini (last-resort dev fallback)

The SoulAuth ``config.settings`` module is intentionally NOT imported
here — this tree owns the @platform/auth schema and must stay
decoupled from the platform-api domain so it can be applied by services
that don't ship the SoulAuth Python package.
"""

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool, create_engine

# Load alembic.ini logging config
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

sync_url = os.environ.get("DATABASE_URL") or config.get_main_option("sqlalchemy.url")
if sync_url and sync_url.startswith("postgresql+asyncpg://"):
    # Alembic uses sync drivers; rewrite an async URL transparently.
    sync_url = sync_url.replace("postgresql+asyncpg://", "postgresql://", 1)

# This tree carries no SQLAlchemy models — migrations are written as raw
# SQL via op.execute(...). Autogenerate is intentionally disabled.
target_metadata = None


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    Generates SQL script without connecting to the database.
    """
    url = sync_url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    Creates a connection and runs migrations directly.
    """
    connectable = create_engine(sync_url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
