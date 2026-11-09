# 02 - Project base setup

## Goal
I had Claude set up the project base: local Postgres in Docker seeded from `db/database.sql`, env validation, TypeORM with migrations, entities for the existing tables, Swagger at `/docs` and `GET /health`. I then committed it in six conventional commits.

## Decisions
- Migrations run only through npm scripts, never on boot; the app and the CLI share one options builder: [ADR-21](../decisions.md#adr-21-running-migrations)
- Compose Postgres on host port 5433, because a native Postgres already uses 5432 (README).
- `@nestjs/terminus` for `/health` and class-validator for env validation (README).

## Where I changed course
- Claude's plan had `MarketData` with `@ManyToOne` to both `Instrument` and `User`. The `marketdata` table has no `userid`, so it only relates to `Instrument`.
- Claude proposed ADR-21 (local dev database) and ADR-22 (health check and env validation). I dropped both because they are setup details, not design decisions, and I had them covered in the README instead. I kept only the migrations ADR, which became ADR-21.

## Open questions
- I have not run `npm run test:e2e`, so the Testcontainers setup is untested.
- The seed-fix and schema-constraint migrations (ADR-14, 15, 16) are still to write, and the entities stay all-nullable until they land.
