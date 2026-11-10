# 07 - Assets endpoint

## Goal
Implement `GET /assets` with search, pagination and a per-asset daily return, with unit and e2e tests, then open a PR.

## Decisions
- `page` and `limit` are strict integers like path ids (`^[1-9]\d*$`, `limit` ≤ 100); anything else is 400. [ADR-08](../decisions.md#adr-08-asset-search-and-pagination)
- `name` and `ticker` are trimmed, blank values are ignored, and more than 255 characters is 400. [ADR-08](../decisions.md#adr-08-asset-search-and-pagination)
- Each asset also returns `daily_return` (from `close` and `previousClose`, 2-decimal string) and `price_date`, both `null` without marketdata. [ADR-08](../decisions.md#adr-08-asset-search-and-pagination)
- A `previousClose` of 0 makes `daily_return` `null` instead of an error. [ADR-08](../decisions.md#adr-08-asset-search-and-pagination)
- The daily return is a pure domain function with unit tests.

## Where I changed course
Nothing in this session: I approved Claude's plan as proposed and did not reject or correct any of its claims.

## Revised my own positions
- [ADR-11](../decisions.md#adr-11-cost-basis-and-yield) and [ADR-20](../decisions.md#adr-20-documented-but-not-implemented) said daily return was not part of the response. I now include it in `/assets` because the spec says to calculate it from `close` and `previousClose`. `/portfolio` still does not expose it.

## Open questions
None
