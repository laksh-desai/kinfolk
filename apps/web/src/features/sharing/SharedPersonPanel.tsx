import { lifespanLabel } from '@kinfolk/shared/dates/partialDate';
import type { Person } from '@kinfolk/shared/schemas/person';
import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconButton } from '../../components/IconButton';

interface SharedPersonPanelProps {
  person: Person;
  name: string;
  relation: string | null;
  closeTo: string;
  relatives: Array<{ id: string; label: string; name: string; href: string }>;
}

/** What a share-link visitor sees about one person: the redacted facts, and nothing to edit. */
export function SharedPersonPanel({ person, name, relation, closeTo, relatives }: SharedPersonPanelProps) {
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [person.id]);

  return (
    <aside aria-labelledby="shared-person-heading" className="fixed inset-0 z-30 flex flex-col overflow-y-auto bg-surface md:static md:z-auto md:w-[22rem] md:shrink-0 md:border-l md:border-line">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id="shared-person-heading" ref={headingRef} tabIndex={-1} className="break-words text-xl font-semibold outline-none">
            {name}
          </h2>
          <p className="text-base text-ink-muted">{[lifespanLabel(person), relation].filter(Boolean).join(' · ')}</p>
        </div>
        <IconButton icon="x" label={`Close details for ${name}`} onClick={() => navigate(closeTo)} />
      </div>
      {relatives.length > 0 ? (
        <ul aria-label="Relationships" className="flex flex-col gap-1 px-5 py-4 text-base">
          {relatives.map((relative) => (
            <li key={relative.id} className="flex flex-wrap gap-x-1.5">
              <span className="font-semibold text-ink-muted">{relative.label}:</span>
              <Link to={relative.href} className="text-accent underline-offset-2 hover:underline">
                {relative.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mx-5 mb-4 rounded-control bg-sunken px-3 py-2 text-sm text-ink-muted">
        This is a shared, read-only view. Contact details, addresses, full dates, notes, and planning answers aren’t included.
      </p>
    </aside>
  );
}
