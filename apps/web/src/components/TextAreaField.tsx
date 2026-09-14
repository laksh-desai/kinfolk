import type { ReactNode, TextareaHTMLAttributes } from 'react';
import type { FieldProps } from '../lib/useForm';
import { FieldShell } from './FieldShell';
import { describedBy, inputClasses } from './fieldStyles';

interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'name' | 'value' | 'onChange' | 'onBlur'> {
  field: FieldProps;
  label: string;
  hint?: ReactNode;
  optionalMark?: boolean;
  className?: string;
}

export function TextAreaField({ field, label, hint, optionalMark, className, rows = 3, ...rest }: TextAreaFieldProps) {
  return (
    <FieldShell id={field.id} label={label} hint={hint} error={field.error} optionalMark={optionalMark} className={className}>
      <textarea
        {...rest}
        ref={field.inputRef}
        id={field.id}
        name={field.name}
        rows={rows}
        value={field.value}
        aria-invalid={field.error ? true : undefined}
        aria-describedby={describedBy(field.id, hint, field.error)}
        onChange={(event) => field.onChange(event.target.value)}
        onBlur={field.onBlur}
        className={inputClasses(Boolean(field.error), 'min-h-24 resize-y')}
      />
    </FieldShell>
  );
}
