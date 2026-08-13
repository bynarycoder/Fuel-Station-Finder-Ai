#!/bin/sh
# Production/container entrypoint.
#
# Apply pending Alembic revisions BEFORE serving traffic. PR #21 taught the
# ORM to SELECT fuel_stations.data_source / verification_status / … and
# fuel_reports.reviewed_* — if those columns are missing, every station
# (and report) read returns HTTP 500 ("Couldn't load stations.").
#
# `alembic upgrade head` is additive and idempotent: existing station rows
# (the 176-station catalogue) are preserved. This script never seeds, resets,
# or deletes data.
set -eu

echo "[start] applying alembic migrations (upgrade head)"
alembic upgrade head
echo "[start] migrations at head; starting uvicorn on 0.0.0.0:${PORT:-8000}"

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
