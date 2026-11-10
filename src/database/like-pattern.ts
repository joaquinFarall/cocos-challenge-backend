/** Escapes `\`, `%` and `_` so user input is matched literally by LIKE / ILIKE. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function containsPattern(value: string): string {
  return `%${escapeLike(value)}%`;
}
