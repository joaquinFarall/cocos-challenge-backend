# Session 06: Orders endpoint

## Goal
Implement `POST /users/:id/orders` in five reviewed steps: e2e harness with Testcontainers, DTO + validation + error format, pure order domain logic, the endpoint with the user row lock, and e2e tests including concurrency.

## Decisions
- Every error, including 500s and unknown routes, uses one shape `{ status_code, error, message, details? }` with an UPPER_SNAKE code: [ADR-23](../decisions.md#adr-23-error-response-format).
- A cash side (`CASH_IN` / `CASH_OUT`) with `LIMIT` is a 400 from the DTO: [ADR-05](../decisions.md#adr-05-cash-orders), [ADR-03](../decisions.md#adr-03-status-codes-by-semantics).
- An `amount` that results in a size above INT max is a 422 `SIZE_OUT_OF_RANGE`: [ADR-03](../decisions.md#adr-03-status-codes-by-semantics).
- Unknown body properties are a 400 (`forbidNonWhitelisted`), like unknown query params in [ADR-08](../decisions.md#adr-08-asset-search-and-pagination).
- The global exception filter logs unexpected errors once, replacing Nest's default handler: [ADR-22](../decisions.md#adr-22-structured-logging).
- The balance check runs under `SELECT … FOR UPDATE` on the user row: [ADR-12](../decisions.md#adr-12-concurrency-row-lock-on-user).

## Where I changed course
- Claude's recommended error-format option left 500s to Nest's default handler. I asked to apply the format to every error, including 500s and unknown routes, and that 500 bodies must not expose internal messages.

## Open questions
- `orders.datetime` is `TIMESTAMP` without time zone, so it depends on the Node process time zone (already listed in [ADR-20](../decisions.md#adr-20-documented-but-not-implemented)).
- The Postman collection from [ADR-18](../decisions.md#adr-18-testing-strategy) is still pending.
