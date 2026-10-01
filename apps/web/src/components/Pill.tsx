import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './Icon';
import type { IconName } from './icons';

const TONES = {
  neutral: 'border-line bg-surface text-ink-muted',
  muted: 'border-line bg-sunken text-ink-muted',
  info: 'border-info/30 bg-info-soft text-info',
  warning: 'border-warning/30 bg-warning-soft text-warning',
  success: 'border-success/30 bg-success-soft text-success',
} as const;

interface PillProps {
  icon?: IconName;
  tone?: keyof typeof TONES;
  className?: string;
  children: ReactNode;
}

/** A small labelled chip: a status, a role, a mode. Always words, never colour alone. */
export function Pill({ icon, tone = 'neutral', className, children }: PillProps) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-sm font-semibold', TONES[tone], className)}>
      {icon ? <Icon name={icon} className="size-4" /> : null}
      {children}
    </span>
  );
}
