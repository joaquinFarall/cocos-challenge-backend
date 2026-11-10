# 05 - Structured logging

## Goal
Add production-style structured logging to the API: one line per request with a request id, JSON output, readable in development and silent in tests, business events, and no bodies or personal data. Claude proposed the library and I had it recorded as an ADR.

## Decisions
- Use `nestjs-pino` (pino + `pino-http`, `pino-pretty` for development), with the request id taken from a valid `X-Request-Id` or generated, and returned in the response: [ADR-22](../decisions.md#adr-22-structured-logging).
- Log only request id, method and path. Never headers, query strings, bodies or remote addresses: [ADR-22](../decisions.md#adr-22-structured-logging).
- Business events go through Nest's `Logger` with an `{ event, ...ids }` payload: [ADR-22](../decisions.md#adr-22-structured-logging).
- Errors are logged once, by Nest's exception handler, and carry their own context: [ADR-22](../decisions.md#adr-22-structured-logging).

## Where I changed course
- Claude's plan caught `LedgerInconsistencyError` in `PortfolioService`, logged it and rethrew it. I rejected that: Nest's `ExceptionsHandler` already logs it, so it would be logged twice. I asked for the error to carry its context (`userId`, `orderId`, `instrumentId`) and propagate, so it is logged once with the stack, request id and context.
- Claude's plan assumed pino-http's request line was enough for 500s. In testing, the 500 request line also carried a generic "failed with status code 500" error next to the real one, so the failure was reported twice. Claude dropped it from the request line with `customErrorObject`; this came from checking the output, not from a decision of mine.

## Open questions
- The `order.placed` event is only documented as a convention in the ADR. I still need to implement it when `POST /users/:id/orders` is built.