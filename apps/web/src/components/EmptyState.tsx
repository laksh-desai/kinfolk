import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './Icon';
import type { IconName } from './icons';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}

/** Every empty state explains what belongs here and offers the next step. */
export function EmptyState({ icon, title, children, action, className, headingLevel = 2 }: EmptyStateProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className={cx('mx-auto flex max-w-lg flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon name={icon} className="size-7" />
      </span>
      <Heading className="text-xl font-semibold">{title}</Heading>
      <div className="text-base text-ink-muted">{children}</div>
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}
