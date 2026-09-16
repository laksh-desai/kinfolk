import { useId, type ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface RadioOption {
  value: string;
  label: string;
  description?: ReactNode;
}

interface RadioGroupProps {
  legend: string;
  /** Groups these radios together. Scoped per instance, so two groups can share a name safely. */
  name: string;
  value: string;
  options: readonly RadioOption[];
  onChange: (value: string) => void;
  hint?: ReactNode;
  className?: string;
}

/** Native radios in a fieldset: arrow keys move between options, the legend names the group. */
export function RadioGroup({ legend, name, value, options, onChange, hint, className }: RadioGroupProps) {
  const id = useId();
  return (
    <fieldset className={cx('flex min-w-0 flex-col gap-2', className)} aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend className="mb-1 text-base font-semibold">{legend}</legend>
      {hint ? (
        <p id={`${id}-hint`} className="-mt-1 text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {options.map((option) => {
        const optionId = `${id}-${option.value || 'none'}`;
        const checked = option.value === value;
        return (
          <div
            key={option.value}
            className={cx('flex items-start gap-3 rounded-control border px-3 py-2', checked ? 'border-accent bg-accent-soft/40' : 'border-line')}
          >
            <input
              id={optionId}
              type="radio"
              // Radios with the same name form one browser group even across different forms, and
              // one left over mid-navigation can silently uncheck the new one: keep names local.
              name={`${id}-${name}`}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              aria-describedby={option.description ? `${optionId}-description` : undefined}
              className="mt-1 size-5 shrink-0 accent-[var(--kf-accent)]"
            />
            <div className="flex min-w-0 flex-col">
              <label htmlFor={optionId} className="text-base font-medium">
                {option.label}
              </label>
              {option.description ? (
                <span id={`${optionId}-description`} className="text-sm text-ink-muted">
                  {option.description}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
