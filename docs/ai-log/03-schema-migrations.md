# Session 03: Schema migrations

## Goal
Implement the schema migrations required by ADR-14, ADR-15 and ADR-16, and update the entities to match the new schema.

## Decisions
- Schema hardening and `rejection_reason` column via migration: [ADR-14](../decisions.md#adr-14-rejection-reason-column), [ADR-15](../decisions.md#adr-15-schema-changes).
- Oversold BMA seed order corrected by a separate migration, matched by content: [ADR-16](../decisions.md#adr-16-seed-data-correction-oversold-bma-order).
- Migrations are applied only through the npm scripts: [ADR-21](../decisions.md#adr-21-running-migrations).
- I approved Claude's plan after one change (below): hand-written raw SQL migrations with explicit constraint names, one migration for schema and one for data.

## Where I changed course
- Claude's plan put the enums in `src/database/entities/enums.ts` as `as const` arrays. I rejected that placement and moved them to `src/domain/enums.ts`, so that entities and future DTOs import them from the domain layer.

## Open questions
- The TypeORM drift check still wants to rename the three foreign keys (the seed's `orders_userid_fkey` vs TypeORM's hashed names). I have not decided whether to set `foreignKeyConstraintName` on the `@JoinColumn`s.
