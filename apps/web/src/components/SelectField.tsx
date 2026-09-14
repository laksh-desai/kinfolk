import type { ReactNode, SelectHTMLAttributes } from 'react';
import type { FieldProps } from '../lib/useForm';
import { FieldShell } from './FieldShell';
import { describedBy, inputClasses } from './fieldStyles';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'name' | 'value' | 'onChange' | 'onBlur'> {
  field: FieldProps;
  label: string;
  options: readonly SelectOption[];
  hint?: ReactNode;
  className?: string;
}

/** A native select: fully keyboard and screen-reader operable, and never clipped by a dialog edge. */
export function SelectField({ field, label, options, hint, required, className, ...rest }: SelectFieldProps) {
  return (
    <FieldShell id={field.id} label={label} hint={hint} error={field.error} className={className}>
      <select
        {...rest}
        ref={field.inputRef}
        id={field.id}
        name={field.name}
        value={field.value}
        aria-invalid={field.error ? true : undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy(field.id, hint, field.error)}
        onChange={(event) => field.onChange(event.target.value)}
        onBlur={field.onBlur}
        className={inputClasses(Boolean(field.error), 'pr-8')}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
