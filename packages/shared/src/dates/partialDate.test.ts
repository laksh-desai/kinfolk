import { describe, expect, it } from 'vitest';
import { partialDateSchema, type PartialDate } from '../schemas/dates';
import { ageLabel, ageOn, cardLabel, comparePartialDates, formatPartialDate, isSameFullDate, lifespanLabel } from './partialDate';

const d = (year: number, month: number | null = null, day: number | null = null, approximate = false): PartialDate => ({ year, month, day, approximate });

describe('partialDateSchema', () => {
  it('accepts year only, month + year, and full dates', () => {
    expect(partialDateSchema.parse({ year: 1942 })).toEqual(d(1942));
    expect(partialDateSchema.parse({ year: 1942, month: 3 })).toEqual(d(1942, 3));
    expect(partialDateSchema.parse({ year: 1942, month: 3, day: 9, approximate: true })).toEqual(d(1942, 3, 9, true));
  });

  it('rejects impossible days with a plain message', () => {
    const result = partialDateSchema.safeParse({ year: 2023, month: 2, day: 29 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('That month only has 28 days.');
    expect(partialDateSchema.safeParse({ year: 2024, month: 2, day: 29 }).success).toBe(true);
    expect(partialDateSchema.safeParse({ year: 1990, day: 4 }).error?.issues[0]?.message).toBe('Choose a month to go with the day.');
  });
});

describe('formatting', () => {
  it('formats each precision and marks approximate dates', () => {
    expect(formatPartialDate(d(1988, 4, 12))).toBe('Apr 12, 1988');
    expect(formatPartialDate(d(1988, 4))).toBe('Apr 1988');
    expect(formatPartialDate(d(1910, null, null, true))).toBe('c. 1910');
    expect(formatPartialDate(d(1988, 4, 12), 'long')).toBe('April 12, 1988');
  });

  it('shows a lifespan, never a bare age (SPEC §6.17)', () => {
    expect(lifespanLabel({ lifeStatus: 'deceased', birthDate: d(1910, null, null, true), deathDate: d(1978, 2, 3) })).toBe('c. 1910–1978');
    expect(lifespanLabel({ lifeStatus: 'deceased', birthDate: d(1935) })).toBe('1935–?');
    expect(lifespanLabel({ lifeStatus: 'deceased', deathDate: d(2001) })).toBe('d. 2001');
    expect(lifespanLabel({ lifeStatus: 'deceased' })).toBe('Deceased');
    expect(lifespanLabel({ lifeStatus: 'living', birthDate: d(1988, 4, 12) })).toBe('b. 1988');
    expect(lifespanLabel({ lifeStatus: 'living', birthYear: 1988 })).toBe('b. 1988');
    expect(lifespanLabel({ lifeStatus: 'unknown' })).toBeNull();
  });
});

describe('derived age', () => {
  it('counts whole years around the birthday', () => {
    expect(ageOn(d(1988, 4, 12), { year: 2026, month: 4, day: 11 })).toEqual({ years: 37, exact: true });
    expect(ageOn(d(1988, 4, 12), { year: 2026, month: 4, day: 12 })).toEqual({ years: 38, exact: true });
  });

  it('is inexact for year-only and approximate dates, and absent for future births', () => {
    expect(ageOn(d(1988), { year: 2026, month: 9, day: 13 })).toEqual({ years: 37, exact: false });
    expect(ageLabel({ lifeStatus: 'living', birthDate: d(1988, 4, null) }, { year: 2026, month: 9, day: 13 })).toBe('Age about 38');
    expect(ageOn(d(2030), { year: 2026, month: 1, day: 1 })).toBeNull();
  });

  it('never gives an age for the deceased', () => {
    expect(ageLabel({ lifeStatus: 'deceased', birthDate: d(1935, 1, 9) }, { year: 2026, month: 1, day: 1 })).toBeNull();
  });

  it('gives a card the living person’s age and the deceased their lifespan (ADR 032)', () => {
    const today = { year: 2026, month: 9, day: 16 };
    expect(cardLabel({ lifeStatus: 'living', birthDate: d(1988, 4, 12) }, today)).toBe('Age 38');
    expect(cardLabel({ lifeStatus: 'living', birthDate: d(1988) }, today)).toBe('Age about 37');
    // A share link carries the birth year alone; an age from it is the same information.
    expect(cardLabel({ lifeStatus: 'living', birthYear: 1988 }, today)).toBe('Age about 37');
    expect(cardLabel({ lifeStatus: 'deceased', birthDate: d(1935), deathDate: d(2005) }, today)).toBe('1935–2005');
    expect(cardLabel({ lifeStatus: 'deceased' }, today)).toBe('Deceased');
    expect(cardLabel({ lifeStatus: 'living' }, today)).toBeNull();
    // A birth date in the future can't make an age, so the card falls back to the year.
    expect(cardLabel({ lifeStatus: 'living', birthDate: d(2030) }, today)).toBe('b. 2030');
  });
});

describe('ordering', () => {
  it('sorts earliest first with unknown dates last, and detects twins', () => {
    const sorted = [d(1996, 3, 14), null, d(1991), d(1996, 3), d(1988, 4, 12)].sort(comparePartialDates);
    expect(sorted).toEqual([d(1988, 4, 12), d(1991), d(1996, 3, 14), d(1996, 3), null]);
    expect(isSameFullDate(d(1996, 3, 14), d(1996, 3, 14))).toBe(true);
    expect(isSameFullDate(d(1996, 3), d(1996, 3))).toBe(false);
  });
});
