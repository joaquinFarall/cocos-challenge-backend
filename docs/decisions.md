# Architecture Decision Record

Decisions taken while designing the Cocos backend challenge. Each entry follows Context → Options → Decision → Consequences. The spec is `docs/backend-challenge.md`; the working design is `docs/design-draft.md`.

Status of every entry: **Accepted**, unless marked otherwise.

## Index

1. [Routes](#adr-01-routes)
2. [Path id validation](#adr-02-path-id-validation)
3. [Status codes by semantics](#adr-03-status-codes-by-semantics)
4. [Order check sequence](#adr-04-order-check-sequence)
5. [Cash orders](#adr-05-cash-orders)
6. [MARKET pricing and instruments without prices](#adr-06-market-pricing-and-instruments-without-prices)
7. [JSON format and money representation](#adr-07-json-format-and-money-representation)
8. [Asset search and pagination](#adr-08-asset-search-and-pagination)
9. [Portfolio computed from orders](#adr-09-portfolio-computed-from-orders)
10. [Cash, reservations and total value](#adr-10-cash-reservations-and-total-value)
11. [Cost basis and yield](#adr-11-cost-basis-and-yield)
12. [Concurrency: row lock on user](#adr-12-concurrency-row-lock-on-user)
13. [Idempotency out of scope](#adr-13-idempotency-out-of-scope)
14. [Rejection reason column](#adr-14-rejection-reason-column)
15. [Schema changes](#adr-15-schema-changes)
16. [Seed data correction (oversold BMA order)](#adr-16-seed-data-correction-oversold-bma-order)
17. [Validation with class-validator](#adr-17-validation-with-class-validator)
18. [Testing strategy](#adr-18-testing-strategy)
19. [Order cancellation](#adr-19-order-cancellation)
20. [Documented but not implemented](#adr-20-documented-but-not-implemented)
21. [Running migrations](#adr-21-running-migrations)

---

## ADR-01: Routes

**Context.** The spec says authentication is not needed. The draft had `POST /orders` with `user_id` in the body.

**Options.**

- `POST /orders` with `user_id` in the body.
- `POST /users/:id/orders`.
- Take the user from a token (adds auth, which was not requested).

**Decision.** `GET /users/:id/portfolio`, `GET /assets`, `POST /users/:id/orders`.

**Consequences.** Same shape as the portfolio route. An unknown user is a path error (404) rather than a body error. The API is unauthenticated, as the spec allows; anyone can place orders for any user id.

## ADR-02: Path id validation

**Context.** Postgres throws on integers outside INT range, which would surface as a 500.

**Decision.** A path `id` must match `^[1-9]\d*$` and be ≤ 2147483647. Anything else (`0`, `-1`, `01`, `1.0`, `abc`, too large) is 400.

**Consequences.** No invalid value reaches the database. Sequential integer ids can be enumerated; UUIDs are the documented improvement (ADR-20).

## ADR-03: Status codes by semantics

**Context.** The draft mixed 400 and 404 for errors depending on which entity was missing. Classifying by "needs a DB lookup" would make the codes depend on implementation.

**Decision.** Classify by meaning:

- **400** malformed request, caught by the DTO: wrong types, missing fields, bad format, more than 2 decimals, values outside INT / NUMERIC(10,2) range, enums not in exact uppercase, LIMIT without price, MARKET with price, `size` and `amount` both sent or neither, unknown query params, invalid `page`/`limit`.
- **404** the user in the path does not exist.
- **422** well-formed but violates a business rule; nothing is persisted: unknown instrument, ARS/side mismatch, instrument without marketdata (MARKET and LIMIT), `amount` that results in 0 shares (MARKET and LIMIT).
- **201 with status `REJECTED`** a valid order without enough cash or shares; it is persisted.

**Consequences.** Clients can tell "fix your request" (400) from "request makes no business sense" (422) from "valid but refused by the market" (201 REJECTED). Enums are case-sensitive (`buy` is a 400) so the API never silently changes what the client sent, and the values match the DB CHECKs exactly.

## ADR-04: Order check sequence

**Decision.** 400 (path and body) → 404 user → 422 business rules → balance check under the user lock → `NEW` / `FILLED` / `REJECTED`.

**Consequences.** Cheap checks run first; only orders that pass every earlier step take the lock.

## ADR-05: Cash orders

**Context.** The spec models transfers as orders with side `CASH_IN` / `CASH_OUT` on the ARS instrument (type `MONEDA`).

**Decision.**

- `CASH_IN` / `CASH_OUT` require the ARS instrument; ARS requires a cash side. Mismatch → 422.
- Type must be `MARKET`; price is forced to 1.
- A `CASH_OUT` above available cash → 201 `REJECTED` (`INSUFFICIENT_FUNDS`).

**Consequences.** Cash is stored in `size` as whole pesos (no centavos). This is a limitation of the provided schema (see ADR-20).

## ADR-06: MARKET pricing and instruments without prices

**Context.** Instruments 3 (PGR) and 10 (IRCP) have no `marketdata` rows. A MARKET order has no price to use, and the schema (ADR-15) requires `price NOT NULL` and `price > 0`.

**Options.**

- Persist as `REJECTED` — impossible without inventing a price.
- 422, nothing persisted.

**Decision.** 422 for MARKET and LIMIT orders on instruments with no marketdata. MARKET orders use the `close` of the row with the latest `date`; that price is stored on the order even when it ends up `REJECTED`. In `/assets`, `last_close` is `null` for such instruments.

**Consequences.** Every position a user can hold has a price, so portfolio valuation never needs a fallback.

## ADR-07: JSON format and money representation

**Decision.**

- `snake_case` for requests and responses.
- Money (`price`, `amount`, `available`, `total_cash`, `total_value`, `value`) and `yield` are decimal **strings** with at most 2 decimals (`"930.00"`, `"2.49"`), in requests and responses.
- `size` and `shares` are JSON integers.
- Computation uses a decimal library, never JS floats. Rounding is half-up, applied only at the response boundary.

**Consequences.** No floating-point drift in balances; `NUMERIC` comes back from Postgres as a string and stays one. Clients must parse strings.

## ADR-08: Asset search and pagination

**Decision.** `GET /assets` accepts only `name`, `ticker`, `page` (default 1) and `limit` (default 20, max 100). Any other param is 400.

- Case-insensitive partial match (`ILIKE`), with `%` and `_` in user input escaped.
- Accents are not handled (e.g. `Rio` does not match `Río`); documented.
- Both filters combine with AND. Empty strings are ignored.
- ARS (`MONEDA`) is excluded.
- Sorted by `ticker`.
- Response: `{ "data": [{ id, ticker, name, type, last_close }], "total", "page", "limit" }`.
- No matches, or a page past the end → 200 with `data: []` (and the real `total`).

**Consequences.** With no params the API returns the first page, not all assets; this changes the draft's original "no params returns all". Using `pg_trgm` / `unaccent` is the documented improvement (ADR-20).

## ADR-09: Portfolio computed from orders

**Context.** The spec says to compute holdings and cash from all relevant rows in `orders`, using `size`.

**Options.** (a) Compute on read from `orders`. (b) Maintain a positions/balances table updated in the order transaction.

**Decision.** (a). Cash and share totals are SQL aggregates; per-user data is small and indexed by `(userid, instrumentid)`.

**Consequences.** Always consistent with the ledger, no projection to keep in sync. At scale, a positions projection updated transactionally and a Redis cache for latest prices would be the next step (ADR-20).

## ADR-10: Cash, reservations and total value

**Decision.**

- `total_cash` = Σ FILLED (`CASH_IN` + `SELL` − `CASH_OUT` − `BUY`) of `size × price`.
- `available` = `total_cash` − Σ `size × price` of `NEW` `BUY` orders.
- Available shares of an instrument = FILLED buys − FILLED sells − `NEW` sells. A `SELL` is checked against this number, so two LIMIT sells cannot reserve the same shares.
- `total_value` = `total_cash` + Σ (`shares` × last `close`). `NEW` orders do not affect it.
- `CANCELLED` and `REJECTED` orders affect nothing.
- A user with no orders → 200 with zeros and an empty `assets` list.

**Consequences.** The draft's earlier available-cash sentence omitted FILLED BUY and cash orders; this replaces it.

## ADR-11: Cost basis and yield

**Context.** The spec asks for "rendimiento total (%)" per position. It does not name a cost-basis method.

**Options.** Weighted average, FIFO. Include or exclude realized P&L.

**Decision.** Weighted-average cost, unrealized yield only: `yield = (shares × last_close − shares × avg_cost) / (shares × avg_cost) × 100`, 2 decimals. Positions with 0 shares are hidden. Division by zero cannot happen: a shown position has shares > 0 and every price is > 0.

The average is a **running** average, computed by a pure domain function over the user's FILLED orders sorted by `datetime, id`: a BUY updates the average; a SELL reduces shares and keeps the average. A SQL `Σ cost / Σ shares` is wrong after sells (buy 10@100, sell 5, buy 5@200 → correct average 150, naive 133.33), so it is not used.

**Consequences.** The function is unit-testable in isolation. Daily return (`close` vs `previousClose`) is not part of the response.

## ADR-12: Concurrency: row lock on user

**Context.** Two parallel orders could both pass the available-cash or available-shares check.

**Options.** Row lock on the user, advisory lock, SERIALIZABLE with retry.

**Decision.** In one transaction: `SELECT … FROM users WHERE id = $1 FOR UPDATE`, compute balances, insert the order.

**Consequences.** Orders of the same user are serialized; different users do not block each other. This is why the functional test needs a real Postgres (ADR-18).

## ADR-13: Idempotency out of scope

**Decision.** No idempotency key. A client retry after a timeout can create a duplicate order.

**Consequences.** Documented limitation. `@nestjs/idempotency` or an `Idempotency-Key` header is the path if needed.

## ADR-14: Rejection reason column

**Context.** A `REJECTED` order does not say why (no funds vs no shares).

**Decision.** Add a nullable `rejection_reason` to `orders`, with `CHECK (rejection_reason IN ('INSUFFICIENT_FUNDS','INSUFFICIENT_SHARES','DATA_CORRECTION'))` and `CHECK (rejection_reason IS NULL OR status = 'REJECTED')`. It is returned in the order response. Seed `REJECTED` orders keep `NULL`: their reason is not inferred.

**Consequences.** Schema change beyond the provided one, allowed and to be justified by the spec's last section. Rows created by the API always carry a reason; seed rows may not.

## ADR-15: Schema changes

**Decision.** Applied by migration:

- `NOT NULL` on the essential columns of `orders` and `marketdata` (not `open`/`high`/`low`, which are null in the seed).
- `CHECK` on `side`, `type`, `status`, and on `size > 0`, `price > 0`.
- `UNIQUE (UPPER(ticker))` (case-insensitive; the seed has 66 distinct tickers).
- `UNIQUE (instrumentid, date)` on `marketdata`.
- Index on `orders (userid, instrumentid)`.
- `orders.rejection_reason` (ADR-14).
- No `synchronize`; the schema is managed by migrations only.

**Consequences.** The database rejects invalid rows even if the application has a bug. The seed must satisfy the constraints, which ADR-16 ensures.

## ADR-16: Seed data correction (oversold BMA order)

**Context.** Seed order `BMA SELL 30 × 1530 MARKET FILLED` sells more than the user ever held: only 20 BMA are FILLED (the 60-share buy is `NEW`). Under the app's rules the position would be −10 and the order would have been rejected.

**Options.** Show the negative position; hide it; leave the data and flag it; correct the row.

**Decision.** Migrate that order to `REJECTED` with `rejection_reason = 'DATA_CORRECTION'`. The migration matches the row by its content (instrument, user, side, size, price, status), not only by `id`.

**Consequences.** Trade-off: `orders` behaves like a ledger, and rewriting history goes against append-only practice (a compensating entry would be the production approach). The spec also defines `REJECTED` as refused at submission. Accepted because the data is provided test data, and the result is a consistent portfolio. For user 1 after the correction: `total_cash` 707,100 and `available` 581,600, with positions PAMP 40 and METR 500, plus BMA 20 and no negative position.

## ADR-17: Validation with class-validator

**Options.** class-validator via `ValidationPipe`; Zod through `StandardSchemaValidationPipe`.

**Decision.** class-validator. Cross-field rules (size XOR amount, MARKET ⇒ no price, LIMIT ⇒ price) are written as custom validators or checked in the DTO layer, and still return 400.

**Consequences.** Familiar to reviewers; cross-field rules need more code than a schema library would.

## ADR-18: Testing strategy

**Decision.**

- Functional test of order placement against real Postgres with Testcontainers (row locking cannot be tested with an in-memory fake). Requires Docker; documented in the README.
- Unit tests for the pure domain logic: weighted-average cost, yield, available cash and shares, sizing from `amount`.
- Postman collection with example calls.

## ADR-19: Order cancellation

**Context.** The spec states that only `NEW` orders can be cancelled but does not list a cancel endpoint.

**Decision.** Not implemented now; possibly added at the end. The route would be `POST /users/:id/orders/:order_id/cancel`, which also resolves ownership without authentication.

## ADR-20: Documented but not implemented

- `timestamptz` instead of `TIMESTAMP` for `orders.datetime`.
- `BIGINT` for `size` (INT caps at 2,147,483,647 and cash is stored as whole pesos).
- `pg_trgm` / `unaccent` for fuzzy, accent-insensitive search.
- A positions projection table and a Redis price cache, if portfolio reads become the bottleneck.
- UUIDs instead of sequential ids, to prevent id enumeration.
- Idempotency keys (ADR-13).
- Authentication and authorization.
- Daily return from `close` / `previousClose` (note: BBAR on 2023-07-14 has `previousClose` 1047.166 vs the previous `close` 1062.20, and 3 decimals do not fit NUMERIC(10,2)).

## ADR-21: Running migrations

**Context.** ADR-15 requires that the schema changes only through migrations. Something has to decide when they run, and the app and the TypeORM CLI must agree on the connection and entities.

**Options.**

- `migrationsRun: true`, so the app applies pending migrations on boot.
- Explicit CLI scripts only.

**Decision.** Migrations run only through npm scripts (`migration:create`, `migration:generate`, `migration:run`, `migration:revert`). The app sets `migrationsRun: false` and `synchronize: false`. One function, `buildDataSourceOptions`, builds the options for both the Nest app and the CLI data source.

**Consequences.** Starting the app never alters the schema; applying a migration is a deliberate step. A fresh database needs `npm run migration:run` after the seed is loaded. The app and the CLI cannot drift apart on entities or settings.
