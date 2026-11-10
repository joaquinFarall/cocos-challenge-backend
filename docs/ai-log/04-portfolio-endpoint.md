# Session 04: Portfolio endpoint

## Goal
Implement `GET /users/:id/portfolio` end to end: pure domain functions, data access without N+1, path id validation, Swagger docs and unit tests.

## Decisions
- Cash, reservations and positions are computed by domain functions over the user's loaded FILLED and NEW orders, not by SQL aggregates; ADR-09 amended: [ADR-09](../decisions.md#adr-09-portfolio-computed-from-orders).
- A FILLED SELL that takes shares below 0 throws and the endpoint answers 500, instead of clamping at 0: [ADR-11](../decisions.md#adr-11-cost-basis-and-yield).
- The app fails fast on boot if migrations are pending, and `db:up` runs the migrations against the local database only: [ADR-21](../decisions.md#adr-21-running-migrations).
- Path ids follow [ADR-02](../decisions.md#adr-02-path-id-validation); unknown user is 404 per [ADR-03](../decisions.md#adr-03-status-codes-by-semantics).

## Where I changed course
- Claude's plan used a plain `Decimal` in places. I required one shared `Decimal.clone` (`D`) everywhere, because otherwise operations run at the default precision.
- Claude's plan recomputed positions inside `buildPortfolio`. I asked that the service compute them once and pass them in.
- Claude's plan had no seed test. I asked for a unit test with the seed scenario, and then for all expected values to be hardcoded.
- Claude's plan only said to fail on boot if migrations are pending. I asked for a clear message that tells me to run `npm run migration:run` and says it modifies the target database. I also asked that `npm run db:up` start the database, wait until healthy and run the migrations.
- Claude proposed `showMigrations()` for the pending check. I asked it to verify that this does not create the migrations table on an unmigrated database and to use a read-only check if it does. It does (`MigrationExecutor.js:109`), so Claude used `getPendingMigrations()`.

## Open questions
- `db:up` sets `DATABASE_URL` inline, which does not work in plain Windows shells. I'll fix that on a clear session.
