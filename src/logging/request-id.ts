import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Uses the client's `X-Request-Id` when it is a single, safe value; otherwise
 * generates one. The restriction keeps arbitrary client input out of the logs.
 */
export function resolveRequestId(
  header: string | string[] | undefined,
): string {
  return typeof header === 'string' && VALID_REQUEST_ID.test(header)
    ? header
    : randomUUID();
}
