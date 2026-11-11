# Cocos Backend Challenge

[![CI](https://github.com/joaquinFarall/cocos-challenge-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/joaquinFarall/cocos-challenge-backend/actions/workflows/ci.yml)

REST API built with NestJS, TypeORM and PostgreSQL. It exposes a user's portfolio, an asset search and order placement (BUY, SELL, CASH_IN, CASH_OUT; MARKET and LIMIT). The spec is in [`docs/backend-challenge.md`](docs/backend-challenge.md); every design decision is recorded in [`docs/decisions.md`](docs/decisions.md).

## Requirements

- Node 24 (see `.nvmrc`)
- Docker (for the local database and for the functional tests)

## Quick start

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run db:up               # start Postgres (seeded), wait until healthy, run migrations
npm run start:dev
```

- API docs (Swagger): http://localhost:8080/docs
- Health check: http://localhost:8080/health
- Postman: import [`postman/cocos-challenge.postman_collection.json`](postman/cocos-challenge.postman_collection.json). It has every endpoint with an example per case (success, `REJECTED`, 400, 404, 422) and a `baseUrl` variable (default `http://localhost:8080`). Order examples change state; `npm run db:reset` restores the seed.

### Using the provided database instead of the local one

Put its connection string in `DATABASE_URL` in `.env`. Two things to know first:

- The app **will not boot** until the migrations have run. It checks on startup and fails with a message if any are pending (ADR-21).
- `npm run migration:run` **modifies the database `DATABASE_URL` points to**: it adds constraints, an index and the `rejection_reason` column (ADR-15), and corrects one seed order (ADR-16). Run it only if you are fine with that. The local Docker database avoids all of this.

## Endpoints

All requests and responses use `snake_case`. Money and yield are decimal **strings** with 2 decimals (`"925.85"`); `size` and `shares` are integers (ADR-07). There is no authentication, as the spec allows.

### `GET /users/:id/portfolio`

Total value, available cash and positions, computed from the user's orders.

```bash
curl localhost:8080/users/1/portfolio
```

```json
{
  "account_number": "10001",
  "available": "581600.00",
  "total_cash": "707100.00",
  "total_value": "888940.00",
  "assets": [
    {
      "instrument_id": 47,
      "ticker": "PAMP",
      "name": "Pampa Holding S.A.",
      "shares": 40,
      "value": "37034.00",
      "yield": "-0.45"
    }
  ]
}
```

(The real response lists three positions; one is shown.) `available` is `total_cash` minus the cash reserved by open `NEW` BUY orders. `yield` is the unrealized return against the weighted-average cost (ADR-10, ADR-11). A user with no orders gets `200` with zeros and an empty `assets` list.

### `GET /assets`

Search by `name` and/or `ticker` (case-insensitive, partial match). Paginated with `page` (default 1) and `limit` (default 20, max 100). Any other query param is a 400 (ADR-08).

```bash
curl "localhost:8080/assets?ticker=pam"
```

```json
{
  "data": [
    {
      "id": 47,
      "ticker": "PAMP",
      "name": "Pampa Holding S.A.",
      "type": "ACCIONES",
      "last_close": "925.85",
      "daily_return": "0.44",
      "price_date": "2023-07-14"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

`last_close`, `daily_return` and `price_date` are `null` for instruments without market data. Accents are not handled (`Rio` does not match `Río`).

### `POST /users/:id/orders`

Send either `size` (exact shares) or `amount` (pesos to invest; the size is `floor(amount / price)`). `LIMIT` requires `price`; `MARKET` must not send it and is priced at the last `close`. Cash orders (`CASH_IN`, `CASH_OUT`) are `MARKET` only, on the ARS instrument (id 66), and `size` is whole pesos (ADR-05).

```bash
curl -X POST localhost:8080/users/1/orders \
  -H 'Content-Type: application/json' \
  -d '{"instrument_id": 47, "side": "BUY", "type": "MARKET", "size": 10}'
```

```json
{
  "id": 12,
  "instrument_id": 47,
  "user_id": 1,
  "side": "BUY",
  "size": 10,
  "price": "925.85",
  "type": "MARKET",
  "status": "FILLED",
  "rejection_reason": null,
  "datetime": "2026-11-10T21:38:11.902Z"
}
```

| Request | Result |
| --- | --- |
| `MARKET` | `201`, status `FILLED` |
| `LIMIT` | `201`, status `NEW` |
| Valid order without enough cash or shares | `201`, status `REJECTED`, `rejection_reason` is `INSUFFICIENT_FUNDS` or `INSUFFICIENT_SHARES`; the order is persisted |

A rejected order looks like this (`BUY` of 100,000 PAMP with 581,600 available):

```json
{
  "id": 19,
  "instrument_id": 47,
  "user_id": 1,
  "side": "BUY",
  "size": 100000,
  "price": "925.85",
  "type": "MARKET",
  "status": "REJECTED",
  "rejection_reason": "INSUFFICIENT_FUNDS",
  "datetime": "2026-11-10T21:38:11.952Z"
}
```

### `GET /health`

Pings the database. `200` when it is reachable, `503` when it is not.

## Errors

Every error has the same shape (ADR-23). Clients can branch on `error`:

```json
{ "status_code": 422, "error": "ZERO_SHARES", "message": "The amount is not enough for a single share" }
```

| Status | Meaning | `error` |
| --- | --- | --- |
| 400 | Malformed request (bad id, types, formats, unknown fields, cross-field rules) | `BAD_REQUEST`, plus `details: [{ field, message }]` with every violated rule |
| 404 | The user in the path does not exist | `USER_NOT_FOUND` |
| 422 | Well-formed but breaks a business rule; nothing is persisted | `INSTRUMENT_NOT_FOUND`, `SIDE_INSTRUMENT_MISMATCH`, `NO_MARKET_DATA`, `ZERO_SHARES`, `SIZE_OUT_OF_RANGE` |
| 500 | Unexpected failure; the real message is never returned | `INTERNAL_SERVER_ERROR` |

Valid orders that the market refuses for lack of cash or shares are **not** errors: they answer `201` with status `REJECTED` (ADR-03).

## Tests

```bash
npm test            # unit tests (pure domain logic, DTOs, filter, logging)
npm run test:e2e    # functional tests, including order placement and concurrency
npm run lint
npm run build
```

`test:e2e` starts a throwaway Postgres 17 with Testcontainers (**needs Docker**), loads `db/database.sql`, runs the migrations and drops the container at the end. It never uses the `DATABASE_URL` from `.env`. A real Postgres is required because the concurrency guarantee relies on a row lock (ADR-12, ADR-18). CI runs lint, build, unit and e2e on every pull request.

## Main decisions

Full reasoning, options and consequences are in [`docs/decisions.md`](docs/decisions.md).

- **Routes** are `GET /users/:id/portfolio`, `GET /assets` and `POST /users/:id/orders`, so an unknown user is a path error ([ADR-01](docs/decisions.md#adr-01-routes)).
- **Status codes follow meaning**: 400 malformed, 404 unknown user, 422 business rule, `201 REJECTED` for a valid order the market refuses ([ADR-03](docs/decisions.md#adr-03-status-codes-by-semantics)). One error format with stable codes ([ADR-23](docs/decisions.md#adr-23-error-response-format)).
- **Money is never a JS `number`**: `decimal.js` for computation, decimal strings in JSON ([ADR-07](docs/decisions.md#adr-07-json-format-and-money-representation)).
- **MARKET orders** use the last `close`. Instruments with no market data (PGR, IRCP) cannot be traded: 422 ([ADR-06](docs/decisions.md#adr-06-market-pricing-and-instruments-without-prices)).
- **Portfolio is computed from `orders`** on read, with pure, unit-tested domain functions, not from a projection table ([ADR-09](docs/decisions.md#adr-09-portfolio-computed-from-orders), [ADR-10](docs/decisions.md#adr-10-cash-reservations-and-total-value)).
- **Yield** uses a running weighted-average cost, unrealized only ([ADR-11](docs/decisions.md#adr-11-cost-basis-and-yield)).
- **Concurrency**: orders of the same user are serialized with `SELECT … FOR UPDATE` on the user row ([ADR-12](docs/decisions.md#adr-12-concurrency-row-lock-on-user)).
- **Schema changes** are migrations only: constraints, indexes and a `rejection_reason` column ([ADR-14](docs/decisions.md#adr-14-rejection-reason-column), [ADR-15](docs/decisions.md#adr-15-schema-changes)). `synchronize` is always `false`, and the app never runs migrations on boot ([ADR-21](docs/decisions.md#adr-21-running-migrations)).
- **Seed correction**: one seed order sells shares the user never held, so a migration marks it `REJECTED` / `DATA_CORRECTION` ([ADR-16](docs/decisions.md#adr-16-seed-data-correction-oversold-bma-order)). The trade-off is explained there.
- **Structured logging** with pino, a request id on every line, and no personal data ([ADR-22](docs/decisions.md#adr-22-structured-logging)).

## Future improvements

Documented but not implemented (see [ADR-13](docs/decisions.md#adr-13-idempotency-out-of-scope), [ADR-19](docs/decisions.md#adr-19-order-cancellation) and [ADR-20](docs/decisions.md#adr-20-documented-but-not-implemented)):

- Order cancellation endpoint (`POST /users/:id/orders/:order_id/cancel`); the spec says only `NEW` orders can be cancelled.
- Idempotency keys, so a client retry cannot create a duplicate order.
- Authentication and authorization; UUIDs instead of sequential ids.
- `timestamptz` for `orders.datetime` and `BIGINT` for `size` (cash is stored as whole pesos).
- `pg_trgm` / `unaccent` for fuzzy, accent-insensitive asset search.
- A positions projection table and a Redis price cache if portfolio reads become the bottleneck.

## How I worked with AI

I used Claude Code throughout this challenge, the way I'd use it in a real job: I owned
the design and every decision, and Claude helped me review that design and wrote most of
the implementation, which I reviewed change by change.

My workflow:
- Read the spec and the seed data to understand what each endpoint needed, the functional
  rules and the database.
- Wrote a design draft by hand before using Claude: the API, the rules for each endpoint,
  the domain, and a full business example to check my understanding.
- Asked Claude to review the draft. We went through every open question, I made the decisions 
  and recorded them.
- Implemented each feature in its own session with a clear scope. I reviewed every plan
  before approving it, challenged proposals I disagreed with, and verified the results by hand.

Where to look:
- [`docs/design-draft.md`](docs/design-draft.md): my design draft. It was updated as
  decisions were made; the original version is in the git history.
- [`docs/decisions.md`](docs/decisions.md): every decision, with the options considered
  and why I chose each one.
- [`docs/ai-log/`](docs/ai-log/): one log per session with its goal, the Claude proposals
  I rejected or changed and why, and positions I revised myself.

## Reference

### Environment variables

Validated on boot; the app refuses to start if one is invalid.

| Variable       | Default       | Description                                          |
| -------------- | ------------- | ---------------------------------------------------- |
| `PORT`         | `8080`        | HTTP port                                            |
| `NODE_ENV`     | `development` | `development`, `test` or `production`                |
| `LOG_LEVEL`    | `info`        | `fatal`, `error`, `warn`, `info`, `debug` or `trace` |
| `DATABASE_URL` | (required)    | `postgresql://user:password@host:port/db`            |

### Local database

`docker-compose.yml` runs Postgres 17 on host port **5433** (so it does not clash with a native Postgres on 5432). The container loads `db/database.sql` only the first time it starts with an empty volume. `npm run db:up` also runs the migrations, always against this local database (the URL is pinned in the script, so it never touches the `DATABASE_URL` in `.env`). To wipe the data, reseed and re-migrate, run `npm run db:reset`.

### Migrations

The schema is managed only by migrations, and the app never runs them on boot ([ADR-21](docs/decisions.md#adr-21-running-migrations)). On boot it only checks: if migrations are pending, startup fails with a message to run `npm run migration:run`. That command modifies the database `DATABASE_URL` points to.

```bash
npm run migration:create src/database/migrations/<Name>
npm run migration:generate src/database/migrations/<Name>
npm run migration:run
npm run migration:revert
```

### Logging

Logs go to stdout through pino: one JSON line per request (method, path, status, duration, request id), human-readable when `NODE_ENV=development`, silent when `NODE_ENV=test`. Every response carries an `X-Request-Id` header: the client's value if it is valid, a generated UUID otherwise. Request bodies and personal data are never logged. `GET /health` is not logged.
