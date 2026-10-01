import { describe, expect, it } from 'vitest';
import { unionDatesSchema, unionDatesToPatch, unionToDatesValues } from './unionForm';

const blank = { startDay: '', startMonth: '', startYear: '', startApproximate: false, endDay: '', endMonth: '', endYear: '', endApproximate: false };

describe('unionDatesSchema', () => {
  it('turns a whole start date into month and day, which is what an anniversary needs', () => {
    const parsed = unionDatesSchema.parse({ ...blank, startDay: '14', startMonth: '6', startYear: '1990' });
    expect(unionDatesToPatch(parsed)).toEqual({ startDate: { year: 1990, month: 6, day: 14, approximate: false }, endDate: null });
  });

  it('accepts a year alone, and keeps the approximate flag', () => {
    const parsed = unionDatesSchema.parse({ ...blank, startYear: '1985', startApproximate: true });
    expect(unionDatesToPatch(parsed).startDate).toEqual({ year: 1985, month: null, day: null, approximate: true });
  });

  it('wants a month to go with a day, and a four-digit year', () => {
    const result = unionDatesSchema.safeParse({ ...blank, startDay: '14', startYear: '1990' });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))).toContain('startMonth');
    const short = unionDatesSchema.safeParse({ ...blank, startYear: '90' });
    expect(short.success ? '' : short.error.issues[0]?.message).toBe('Enter the start year as a four-digit year, like 1962.');
  });

  it('refuses an end before the start, down to the day', () => {
    const result = unionDatesSchema.safeParse({ ...blank, startDay: '20', startMonth: '6', startYear: '1990', endDay: '19', endMonth: '6', endYear: '1990' });
    expect(result.success ? [] : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)).toContain('endYear: The end date is before the start date.');
    expect(unionDatesSchema.safeParse({ ...blank, startYear: '1990', endYear: '1990' }).success).toBe(true);
  });

  it('round-trips a union into form values', () => {
    const values = unionToDatesValues({ startDate: { year: 2011, month: 3, day: null, approximate: false }, endDate: null });
    expect(values).toMatchObject({ startYear: '2011', startMonth: '3', startDay: '', endYear: '' });
    expect(unionDatesToPatch(unionDatesSchema.parse(values)).startDate).toEqual({ year: 2011, month: 3, day: null, approximate: false });
  });
});
