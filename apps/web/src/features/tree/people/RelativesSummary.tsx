import type { DirectRelatives, RelativeEntry } from '@kinfolk/shared/relatives/directRelatives';
import { Link } from 'react-router-dom';

interface RelativesSummaryProps {
  treeId: string;
  relatives: DirectRelatives;
  names: Map<string, string>;
}

/** "Father: Vikram Sharma · Wife: Priya Sharma (m. 2011)" — each name opens that person. */
export function RelativesSummary({ treeId, relatives, names }: RelativesSummaryProps) {
  const entries: RelativeEntry[] = [
    ...relatives.parentFamilies.flatMap((family) => family.parents),
    ...relatives.partners,
    ...relatives.siblings,
    ...relatives.childFamilies.flatMap((family) => family.children),
  ];
  const unique = entries.filter((entry, position) => entries.findIndex((other) => other.personId === entry.personId) === position);
  if (unique.length === 0) {
    return <p className="px-5 pb-4 text-base text-ink-muted">No relationships yet. Add a parent, partner, child, or sibling to connect them.</p>;
  }
  return (
    <ul aria-label="Relationships" className="flex flex-col gap-1 px-5 pb-4 text-base">
      {unique.map((entry) => (
        <li key={entry.personId} className="flex flex-wrap gap-x-1.5">
          <span className="font-semibold text-ink-muted">{entry.label}:</span>
          <Link to={`/trees/${treeId}/people/${entry.personId}`} className="text-accent underline-offset-2 hover:underline">
            {names.get(entry.personId) ?? 'Unnamed person'}
          </Link>
          {entry.detail ? <span className="text-ink-muted">({entry.detail})</span> : null}
        </li>
      ))}
    </ul>
  );
}
