import { useState } from 'react';
import { FieldShell } from './FieldShell';
import { describedBy, inputClasses } from './fieldStyles';
import { Icon } from './Icon';
import type { TextFieldProps } from './TextField';

export function PasswordField(props: Omit<TextFieldProps, 'type' | 'optionalMark'>) {
  const [visible, setVisible] = useState(false);
  const { field, label, hint, required, className, ...rest } = props;
  return (
    <FieldShell id={field.id} label={label} hint={hint} error={field.error} required={required} className={className}>
      <div className="relative">
        <input
          {...rest}
          ref={field.inputRef}
          id={field.id}
          name={field.name}
          type={visible ? 'text' : 'password'}
          value={field.value}
          aria-invalid={field.error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy(field.id, hint, field.error)}
          onChange={(event) => field.onChange(event.target.value)}
          onBlur={field.onBlur}
          className={inputClasses(Boolean(field.error), 'pr-14')}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center rounded-r-control text-ink-muted hover:text-ink"
        >
          <Icon name={visible ? 'eye-off' : 'eye'} />
        </button>
      </div>
    </FieldShell>
  );
}
