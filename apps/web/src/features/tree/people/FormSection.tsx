import { useId, type ReactNode } from 'react';

interface FormSectionProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

export function FormSection({ title, description, children }: FormSectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-b border-line px-5 py-5 last:border-b-0">
      <div>
        <h3 id={id} className="text-lg font-semibold">
          {title}
        </h3>
        {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
