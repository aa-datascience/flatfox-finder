-- Runs automatically on first Postgres container start (docker-entrypoint-initdb.d).
-- Enables extensions the matching engine needs for geo radius search (§7 / §5b).
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;
