import type { PartialDate } from '../schemas/dates';
import type { LifeStatus } from '../schemas/person';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

/** "12 Apr 1988", "Apr 1988", "1988", with "c. " when approximate. */
export function formatPartialDate(date: PartialDate, style: 'short' | 'long' = 'short'): string {
  const months = style === 'long' ? MONTHS_LONG : MONTHS_SHORT;
  // Month first, US order: "Apr 12, 1988", "Apr 1988", "1988".
  const month = date.month === null ? '' : (months[date.month - 1] ?? '');
  const head = date.month !== null && date.day !== null ? `${month} ${date.day},` : month;
  return `${date.approximate ? 'c. ' : ''}${head ? `${head} ` : ''}${date.year}`;
}

function yearText(date: PartialDate): string {
  return `${date.approximate ? 'c. ' : ''}${date.year}`;
}

/**
 * A person's dates in words: "1942–2019" for the deceased, "b. 1988" for the living,
 * "d. 2011" when only death is known, and "Deceased" when neither.
 */
export function lifespanLabel(person: { lifeStatus: LifeStatus; birthDate?: PartialDate | null; deathDate?: PartialDate | null; birthYear?: number | null }): string | null {
  const birth = person.birthDate ?? (person.birthYear ? { year: person.birthYear, month: null, day: null, approximate: false } : null);
  const death = person.deathDate ?? null;
  if (person.lifeStatus === 'deceased') {
    if (birth && death) return `${yearText(birth)}–${yearText(death)}`;
    if (birth) return `${yearText(birth)}–?`;
    if (death) return `d. ${yearText(death)}`;
    return 'Deceased';
  }
  if (birth) return `b. ${yearText(birth)}`;
  return null;
}

/**
 * Whole years between a partial birth date and a calendar day. Derived, never stored. With a
 * year-only birth the result is a range; this returns the lower bound and flags it inexact.
 */
export function ageOn(birth: PartialDate, on: CalendarDay): { years: number; exact: boolean } | null {
  let years = on.year - birth.year;
  if (birth.month === null) return years >= 0 ? { years: Math.max(0, years - 1), exact: false } : null;
  if (on.month < birth.month || (on.month === birth.month && birth.day !== null && on.day < birth.day)) years -= 1;
  if (years < 0) return null;
  return { years, exact: birth.day !== null && !birth.approximate };
}

/**
 * "Age 37", "Age about 37", or null. Living people only: the deceased have no current age
 * (SPEC §3), and a year-only or approximate birth date can only give "about".
 */
export function ageLabel(
  person: { lifeStatus: LifeStatus; birthDate?: PartialDate | null; birthYear?: number | null },
  today: CalendarDay,
): string | null {
  if (person.lifeStatus === 'deceased') return null;
  const birth = person.birthDate ?? (person.birthYear ? { year: person.birthYear, month: null, day: null, approximate: false } : null);
  if (!birth) return null;
  const age = ageOn(birth, today);
  if (!age) return null;
  return age.exact ? `Age ${age.years}` : `Age about ${age.years}`;
}

/**
 * What a card shows (ADR 032): a living person's current age, and a lifespan for anyone who
 * has died — they have no current age, and a card must still say that they died (SPEC §6.17).
 * Falls back to the dates whenever no age can be worked out.
 */
export function cardLabel(
  person: { lifeStatus: LifeStatus; birthDate?: PartialDate | null; deathDate?: PartialDate | null; birthYear?: number | null },
  today: CalendarDay,
): string | null {
  return ageLabel(person, today) ?? lifespanLabel(person);
}

/** Sort order for siblings: earliest first; missing parts sort after known ones; unknown dates last. */
export function comparePartialDates(a: PartialDate | null | undefined, b: PartialDate | null | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  if (a.year !== b.year) return a.year - b.year;
  const monthA = a.month ?? 13;
  const monthB = b.month ?? 13;
  if (monthA !== monthB) return monthA - monthB;
  return (a.day ?? 32) - (b.day ?? 32);
}

/** Two dates name the same known calendar day (used to detect multiple births). */
export function isSameFullDate(a: PartialDate | null | undefined, b: PartialDate | null | undefined): boolean {
  return Boolean(a && b && a.month !== null && a.day !== null && a.year === b.year && a.month === b.month && a.day === b.day);
}

export function toCalendarDay(date: Date): CalendarDay {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
