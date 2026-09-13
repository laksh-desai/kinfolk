import { useId, type ReactNode } from 'react';

interface AccountSectionProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

export function AccountSection({ title, description, children }: AccountSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <h2 id={headingId} className="text-xl font-semibold">
        {title}
      </h2>
      {description ? <div className="mt-1 text-base text-ink-muted">{description}</div> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}
