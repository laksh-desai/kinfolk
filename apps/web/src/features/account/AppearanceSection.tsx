import { useId } from 'react';
import { setThemePreference, useThemePreference, type ThemePreference } from '../../lib/preferences';
import { AccountSection } from './AccountSection';

const OPTIONS: Array<{ value: ThemePreference; label: string; description: string }> = [
  { value: 'dark', label: 'Dark', description: 'Kinfolk’s default: pale text on deep navy, easier in dim rooms.' },
  { value: 'light', label: 'Light', description: 'Navy text on a cool paper background.' },
  { value: 'system', label: 'Match this device', description: 'Follows your computer’s light or dark setting.' },
];

export function AppearanceSection() {
  const theme = useThemePreference();
  const name = useId();
  return (
    <AccountSection title="Appearance">
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Colour theme</legend>
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={theme === option.value}
              onChange={() => setThemePreference(option.value)}
              className="mt-1 size-5 accent-[var(--kf-accent)]"
            />
            <span>
              <span className="block font-semibold">{option.label}</span>
              <span className="block text-sm text-ink-muted">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </AccountSection>
  );
}
