# Cocos Backend Challenge

REST API built with NestJS, TypeORM and PostgreSQL. The spec is in `docs/backend-challenge.md` and the design decisions are in `docs/decisions.md`.

## Local setup

Requirements: Node 24 (`.nvmrc`) and Docker.

```bash
npm install
cp .env.example .env
npm run db:up        # start Postgres, seeded from db/database.sql
npm run migration:run
npm run start:dev
```

- API docs (Swagger): http://localhost:8080/docs
- Health check: http://localhost:8080/health

### Database

`docker-compose.yml` runs Postgres 17 on host port **5433** (so it does not clash with a native Postgres on 5432). The container loads `db/database.sql` only the first time it starts with an empty volume. To wipe the data and reseed, run `npm run db:reset`.

### Environment variables

Validated on boot; the app refuses to start if one is invalid.

| Variable       | Default       | Description                               |
| -------------- | ------------- | ----------------------------------------- |
| `PORT`         | `8080`        | HTTP port                                 |
| `NODE_ENV`     | `development` | `development`, `test` or `production`     |
| `DATABASE_URL` | (required)    | `postgresql://user:password@host:port/db` |

### Health check

`GET /health` pings the database. It returns 200 when the database is reachable and 503 when it is not.

### Migrations

The schema is managed only by migrations (`synchronize` is always `false`), and the app never runs them on boot (ADR-21).

```bash
npm run migration:create src/database/migrations/<Name>
npm run migration:generate src/database/migrations/<Name>
npm run migration:run
npm run migration:revert
```

## Scripts

- `npm run build`: build
- `npm run lint`: oxlint
- `npm test`: unit tests
- `npm run test:e2e`: functional tests (need Docker for Testcontainers)
