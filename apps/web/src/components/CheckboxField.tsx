import type { ReactNode } from 'react';

interface CheckboxFieldProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
}

export function CheckboxField({ id, label, checked, onChange, hint }: CheckboxFieldProps) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-1 size-5 shrink-0 accent-[var(--kf-accent)]"
      />
      <div className="flex flex-col">
        <label htmlFor={id} className="text-base font-semibold">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-sm text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
