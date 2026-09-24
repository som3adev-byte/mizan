#!/bin/sh
# Runs once, when the database volume is first created.
# mizan_owner owns the tables and runs migrations.
# mizan_app is what the API connects as: not a superuser, cannot bypass
# row-level security, so tenant isolation is enforced by the database itself.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE mizan_app LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE DATABASE mizan_test OWNER mizan_owner;
SQL
