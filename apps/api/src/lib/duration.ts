const UNIT_MS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

export const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d)$/;

/** Parses "15m", "30d", "500ms" into milliseconds. Throws on anything else. */
export function parseDuration(value: string): number {
  const match = DURATION_PATTERN.exec(value.trim());
  if (!match) throw new Error(`"${value}" is not a duration like 15m or 30d`);
  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof UNIT_MS;
  return amount * UNIT_MS[unit];
}
