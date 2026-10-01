import { z } from 'zod';
import { comparePartialDates } from '../dates/partialDate';
import { checkDate, dateToParts, partsToDate, yearText } from './personForm';
import type { Union, UnionPatch } from './union';

/**
 * The dates of a partnership, form-shaped: when it began and, if it has, when it ended. A whole
 * date is what makes an anniversary (Key Events needs a month and a day); a year alone is fine.
 */
export const unionDatesSchema = z
  .object({
    startDay: z.string().trim(),
    startMonth: z.string().trim(),
    startYear: yearText('start year'),
    startApproximate: z.boolean(),
    endDay: z.string().trim(),
    endMonth: z.string().trim(),
    endYear: yearText('end year'),
    endApproximate: z.boolean(),
  })
  .superRefine((values, ctx) => {
    checkDate(ctx, 'start', 'start', { day: values.startDay, month: values.startMonth, year: values.startYear });
    checkDate(ctx, 'end', 'end', { day: values.endDay, month: values.endMonth, year: values.endYear });
    const start = partsToDate(values.startDay, values.startMonth, values.startYear, false);
    const end = partsToDate(values.endDay, values.endMonth, values.endYear, false);
    if (start && end && comparePartialDates(end, start) < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endYear'], message: 'The end date is before the start date.' });
    }
  });

export type UnionDatesValues = z.input<typeof unionDatesSchema>;

export function unionToDatesValues(union: Pick<Union, 'startDate' | 'endDate'>): UnionDatesValues {
  const start = dateToParts(union.startDate);
  const end = dateToParts(union.endDate);
  return {
    startDay: start.day,
    startMonth: start.month,
    startYear: start.year,
    startApproximate: start.approximate,
    endDay: end.day,
    endMonth: end.month,
    endYear: end.year,
    endApproximate: end.approximate,
  };
}

export function unionDatesToPatch(values: z.output<typeof unionDatesSchema>): Pick<UnionPatch, 'startDate' | 'endDate'> {
  return {
    startDate: partsToDate(values.startDay, values.startMonth, values.startYear, values.startApproximate),
    endDate: partsToDate(values.endDay, values.endMonth, values.endYear, values.endApproximate),
  };
}
