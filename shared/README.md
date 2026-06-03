# /shared

Cross-cutting database and config assets used by **both** `/app` (Next.js, via Prisma)
and `/worker` (Python, via SQLAlchemy/psycopg).

## Source of truth for the schema

Prisma owns the schema: [`app/prisma/schema.prisma`](../app/prisma/schema.prisma).
Migrations are generated with `npx prisma migrate dev` and committed under
`app/prisma/migrations/`. The Python worker reads the *same* database but does not
manage migrations — it treats the schema as read/write but Prisma-owned.

> Building the full schema (tables in PROJECT-PLAN §6) is the **next task (Task #2)**.
> This scaffold only sets up the database container and extensions.

## Contents

- `init/01-extensions.sql` — auto-run on first Postgres start; enables `cube` +
  `earthdistance` for radius search.
- `migrations/` — reserved (Prisma migrations live in `/app/prisma/migrations`; this
  folder is for any raw/worker-side SQL we may add later).
