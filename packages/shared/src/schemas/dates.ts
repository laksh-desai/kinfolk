import { z } from 'zod';

/** A date that may be year-only or month+year, and may be flagged as approximate. */
export interface PartialDate {
  year: number;
  month: number | null;
  day: number | null;
  approximate: boolean;
}

export const MIN_YEAR = 1000;
export const MAX_YEAR = 2200;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export const partialDateSchema: z.ZodType<PartialDate, z.ZodTypeDef, unknown> = z
  .object({
    year: z
      .number({ invalid_type_error: 'Enter a year like 1962.', required_error: 'Enter a year like 1962.' })
      .int('Enter a year like 1962.')
      .min(MIN_YEAR, `Enter a year after ${MIN_YEAR}.`)
      .max(MAX_YEAR, `Enter a year before ${MAX_YEAR}.`),
    month: z.number().int().min(1, 'Choose a month.').max(12, 'Choose a month.').nullable().optional(),
    day: z.number().int().min(1, 'Enter a day between 1 and 31.').max(31, 'Enter a day between 1 and 31.').nullable().optional(),
    approximate: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.day != null && value.month == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['month'], message: 'Choose a month to go with the day.' });
    }
    if (value.day != null && value.month != null && value.day > daysInMonth(value.year, value.month)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['day'],
        message: `That month only has ${daysInMonth(value.year, value.month)} days.`,
      });
    }
  })
  .transform((value) => ({
    year: value.year,
    month: value.month ?? null,
    day: value.month == null ? null : (value.day ?? null),
    approximate: value.approximate ?? false,
  }));
