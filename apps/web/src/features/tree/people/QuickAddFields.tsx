import { SelectField } from '../../../components/SelectField';
import { TextField } from '../../../components/TextField';
import type { FieldProps } from '../../../lib/useForm';
import { MONTH_OPTIONS } from './DateFields';

export const GENDER_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'unknown', label: 'Unknown' },
] as const;

export const LIFE_STATUS_OPTIONS = [
  { value: 'living', label: 'Living' },
  { value: 'deceased', label: 'Deceased' },
  { value: 'unknown', label: 'Not known' },
] as const;

export const QUICK_ADD_LABELS = {
  firstName: 'First name',
  lastName: 'Last name',
  gender: 'Gender',
  lifeStatus: 'Living or deceased',
  birthDay: 'Day',
  birthMonth: 'Month',
  birthYear: 'Year',
};

/** The quick-add fields (SPEC §5.3): name, gender, living or deceased, date of birth. */
export function QuickAddFields({ field }: { field: (name: string) => FieldProps }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <TextField field={field('firstName')} label={QUICK_ADD_LABELS.firstName} required autoComplete="off" />
      <TextField field={field('lastName')} label={QUICK_ADD_LABELS.lastName} optionalMark autoComplete="off" />
      <SelectField field={field('gender')} label={QUICK_ADD_LABELS.gender} options={GENDER_OPTIONS} required />
      <SelectField field={field('lifeStatus')} label={QUICK_ADD_LABELS.lifeStatus} options={LIFE_STATUS_OPTIONS} required />
      <fieldset className="flex min-w-0 flex-col gap-2 sm:col-span-2">
        <legend className="mb-1 text-base font-semibold">Date of birth</legend>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,5rem)_minmax(0,6rem)] gap-3">
          <SelectField field={field('birthMonth')} label={QUICK_ADD_LABELS.birthMonth} options={MONTH_OPTIONS} />
          <TextField field={field('birthDay')} label={QUICK_ADD_LABELS.birthDay} optionalMark inputMode="numeric" maxLength={2} autoComplete="off" />
          <TextField field={field('birthYear')} label={QUICK_ADD_LABELS.birthYear} optionalMark inputMode="numeric" maxLength={4} autoComplete="off" />
        </div>
        <p className="text-sm text-ink-muted">A year on its own is fine — add the day and month whenever you know them.</p>
      </fieldset>
    </div>
  );
}
