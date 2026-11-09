# 01 - Design review and decisions

## Goal
I had Claude review my `docs/design-draft.md` against the spec and the seed data, then I settled the open questions and recorded the decisions. After that I set up project tooling (CLAUDE.md, a hook, `/session-log`). No application code.

## Decisions
- Routes and path id validation: [ADR-01](../decisions.md#adr-01-routes), [ADR-02](../decisions.md#adr-02-path-id-validation)
- 400 / 404 / 422 / 201+REJECTED by meaning: [ADR-03](../decisions.md#adr-03-status-codes-by-semantics)
- `/assets` search and pagination: [ADR-08](../decisions.md#adr-08-asset-search-and-pagination)
- Portfolio from `orders`, weighted-average cost, unrealized yield: [ADR-09](../decisions.md#adr-09-portfolio-computed-from-orders), [ADR-11](../decisions.md#adr-11-cost-basis-and-yield)
- Row lock on user; idempotency out of scope: [ADR-12](../decisions.md#adr-12-concurrency-row-lock-on-user), [ADR-13](../decisions.md#adr-13-idempotency-out-of-scope)
- `rejection_reason` column, schema changes, BMA seed correction: [ADR-14](../decisions.md#adr-14-rejection-reason-column), [ADR-15](../decisions.md#adr-15-schema-changes), [ADR-16](../decisions.md#adr-16-seed-data-correction-oversold-bma-order)

## Where I changed course
- Claude said example order 11 contradicted the seed. It is hypothetical; I kept it and labelled it as such.
- Claude claimed the seed LIMIT orders are only FILLED or CANCELLED. Orders 5 and 7 are NEW.
- Claude stated every instrument has 2 marketdata rows. PGR, IRCP and ARS have none.
- Pagination: Claude proposed a plain array body, an `X-Total-Count` header and a large default limit. I required `{ data, total, page, limit }`, default 20, max 100.
- Error codes: Claude proposed 400 vs 422 by whether a DB lookup is needed, and 400 for 0 shares on LIMIT. I classify by semantics; 0 shares is 422 for MARKET and LIMIT.
- `rejection_reason`: Claude proposed a CHECK forcing it for every REJECTED order. I made it nullable; seed REJECTED rows keep NULL because I don't infer their reason.

## Revised my own positions
- Q3: I first leaned toward a positions table plus a Redis cache. I switched to computing from `orders` because the spec requires it, and documented the projection for scale.
- Q17: I first chose an in-memory DB for the functional test. I switched to real Postgres because row locks can't be verified in memory.

## Open questions
- Cancel endpoint: do I implement it at the end or leave it documented ([ADR-19](../decisions.md#adr-19-order-cancellation))?
- Seed-fix migration: the row matching rule is only described, not specified.
- The draft's "Technical spec" list omits class-validator and Testcontainers.
