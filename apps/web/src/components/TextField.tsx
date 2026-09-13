import type { InputHTMLAttributes, ReactNode } from 'react';
import type { FieldProps } from '../lib/useForm';
import { FieldShell } from './FieldShell';
import { describedBy, inputClasses } from './fieldStyles';

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'name' | 'value' | 'onChange' | 'onBlur' | 'ref'> {
  field: FieldProps;
  label: string;
  hint?: ReactNode;
  optionalMark?: boolean;
  className?: string;
}

export function TextField({ field, label, hint, required, optionalMark, className, type = 'text', ...rest }: TextFieldProps) {
  return (
    <FieldShell
      id={field.id}
      label={label}
      hint={hint}
      error={field.error}
      required={required}
      optionalMark={optionalMark}
      className={className}
    >
      <input
        {...rest}
        ref={field.inputRef}
        id={field.id}
        name={field.name}
        type={type}
        value={field.value}
        aria-invalid={field.error ? true : undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy(field.id, hint, field.error)}
        onChange={(event) => field.onChange(event.target.value)}
        onBlur={field.onBlur}
        className={inputClasses(Boolean(field.error))}
      />
    </FieldShell>
  );
}
