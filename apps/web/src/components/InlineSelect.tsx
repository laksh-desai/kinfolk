import { useId } from 'react';
import { inputClasses } from './fieldStyles';

interface InlineSelectProps {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  className?: string;
}

/** A labelled select that acts on change — for settings that save immediately and can be undone. */
export function InlineSelect({ label, value, options, onChange, className }: InlineSelectProps) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink-muted">
        {label}
      </label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={inputClasses(false, 'pr-8')}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
