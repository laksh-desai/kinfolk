import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { treeDetailsQuery } from './LinkedTreeNotice';

/** Shown when a linked tree was opened from a person's card: the way back to where you came from. */
export function LinkedTreeBreadcrumb({ fromTreeId, personId }: { fromTreeId: string; personId: string | null }) {
  const from = useQuery(treeDetailsQuery(fromTreeId));
  if (!from.isSuccess) return null;
  const back = personId ? `/trees/${fromTreeId}/people/${personId}` : `/trees/${fromTreeId}`;
  return (
    <nav aria-label="Breadcrumb" className="border-b border-line bg-sunken/60 px-4 py-1.5 text-sm sm:px-6">
      <Link to={back} className="inline-flex min-h-8 items-center gap-1 font-semibold text-accent underline-offset-2 hover:underline">
        <Icon name="arrow-left" className="size-4" />
        Back to {from.data.name}
      </Link>
    </nav>
  );
}
