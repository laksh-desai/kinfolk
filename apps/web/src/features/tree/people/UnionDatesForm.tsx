import type { PartialDate } from '@kinfolk/shared/schemas/dates';
import { MAX_YEAR, MIN_YEAR } from '@kinfolk/shared/schemas/dates';
import type { Union, UnionPatch } from '@kinfolk/shared/schemas/union';
import { z } from 'zod';
import { Button } from '../../../components/Button';
import { TextField } from '../../../components/TextField';
import { useForm } from '../../../lib/useForm';

const year = (label: string) =>
  z
    .string()
    .trim()
    .refine((value) => value === '' || (/^\d{4}$/.test(value) && Number(value) >= MIN_YEAR && Number(value) <= MAX_YEAR), { message: `Enter the ${label} as a four-digit year, like 1985.` });

const unionDatesSchema = z
  .object({ startYear: year('start year'), endYear: year('end year') })
  .refine((values) => !values.startYear || !values.endYear || Number(values.endYear) >= Number(values.startYear), {
    path: ['endYear'],
    message: 'The end year is before the start year.',
  });

/** Keeps a known month and day when only the year is unchanged. */
function withYear(date: PartialDate | null, text: string): PartialDate | null {
  if (!text) return null;
  const value = Number(text);
  return date && date.year === value ? date : { year: value, month: null, day: null, approximate: false };
}

interface UnionDatesFormProps {
  union: Union;
  idPrefix: string;
  onSave: (patch: UnionPatch) => void;
}

export function UnionDatesForm({ union, idPrefix, onSave }: UnionDatesFormProps) {
  const form = useForm({
    schema: unionDatesSchema,
    initialValues: { startYear: union.startDate ? String(union.startDate.year) : '', endYear: union.endDate ? String(union.endDate.year) : '' },
    labels: { startYear: 'Start year', endYear: 'End year' },
    idPrefix,
    onSubmit: (values) => {
      const patch: UnionPatch = { startDate: withYear(union.startDate, values.startYear), endDate: withYear(union.endDate, values.endYear) };
      if (JSON.stringify(patch.startDate) === JSON.stringify(union.startDate) && JSON.stringify(patch.endDate) === JSON.stringify(union.endDate)) return;
      onSave(patch);
    },
  });
  const kindWord = union.type === 'marriage' ? 'Year married' : 'Year together';
  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-wrap items-end gap-3">
      <TextField field={form.field('startYear')} label={kindWord} inputMode="numeric" maxLength={4} autoComplete="off" className="w-32" />
      <TextField field={form.field('endYear')} label="Year ended" inputMode="numeric" maxLength={4} autoComplete="off" className="w-32" />
      <Button type="submit" pending={form.submitting} pendingLabel="Saving…">
        Save years
      </Button>
    </form>
  );
}
