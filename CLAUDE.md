# CLAUDE.md

## Project
Cocos backend challenge: a REST API built with NestJS, TypeORM and PostgreSQL (Jest for tests).
- Spec: `docs/backend-challenge.md`
- Decisions: `docs/decisions.md` (**source of truth**; if anything disagrees with it, it wins)
- Draft: `docs/design-draft.md` (working notes, aligned with the decisions)

## Commands
- `npm run build` build
- `npm run start:dev` run with watch
- `npm run lint` oxlint (type-aware)
- `npm test` unit tests
- `npm run test:e2e` functional tests (need Docker for Testcontainers)

## Conventions
- All code, commits and docs are in English.
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`).
- Never use a JS `number` for money or prices. Use `decimal.js`; `NUMERIC` columns map to `string` / `Decimal` (use a TypeORM column transformer).
- Domain logic (cash, reservations, weighted-average cost, yield, order sizing) lives in pure functions, unit-tested, separate from controllers and repositories.
- TypeORM `synchronize` is always `false`. Schema changes only through migrations.
- Never write to the remote Neon database. Use the local one.
- Any new design decision must be confirmed with the user first and added to `docs/decisions.md`.
