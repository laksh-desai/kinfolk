import { CheckboxField } from '../../../components/CheckboxField';
import { SelectField } from '../../../components/SelectField';
import { TextField } from '../../../components/TextField';
import type { FieldProps } from '../../../lib/useForm';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_OPTIONS = [{ value: '', label: 'Month not known' }, ...MONTHS.map((label, index) => ({ value: String(index + 1), label }))];

interface DateFieldsProps {
  prefix: 'birth' | 'death';
  legend: string;
  field: (name: string) => FieldProps;
  approximate: boolean;
  onApproximateChange: (value: boolean) => void;
}

/** A partial date: year alone is enough; month and day are optional; "approximate" is a flag. */
export function DateFields({ prefix, legend, field, approximate, onApproximateChange }: DateFieldsProps) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-1 text-base font-semibold">{legend}</legend>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,5rem)_minmax(0,6rem)] gap-3">
        <SelectField field={field(`${prefix}Month`)} label="Month" options={MONTH_OPTIONS} />
        <TextField field={field(`${prefix}Day`)} label="Day" inputMode="numeric" maxLength={2} autoComplete="off" />
        <TextField field={field(`${prefix}Year`)} label="Year" inputMode="numeric" maxLength={4} autoComplete="off" />
      </div>
      <CheckboxField id={`person-${prefix}Approximate`} label="This date is approximate" checked={approximate} onChange={onApproximateChange} />
    </fieldset>
  );
}
