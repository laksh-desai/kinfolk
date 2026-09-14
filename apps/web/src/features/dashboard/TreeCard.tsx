import type { TreeSummaryDto } from '@kinfolk/shared/schemas/tree';
import { Link } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { StatusBadge } from '../../components/StatusBadge';
import { relativeTime } from '../../lib/relativeTime';

const ROLE_WORD = { owner: null, editor: 'Editor', viewer: 'Viewer', reviewer: 'Reviewer' } as const;

/** One tree on the dashboard: the whole card opens it; details are text, never colour alone. */
export function TreeCard({ tree }: { tree: TreeSummaryDto }) {
  const role = ROLE_WORD[tree.role];
  return (
    <li className="relative flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card focus-within:ring-4 focus-within:ring-accent/30 hover:border-accent">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar name={tree.name} src={tree.thumbnailUrl} size="md" />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold leading-snug">
            <Link to={`/trees/${tree.id}`} className="break-words outline-none after:absolute after:inset-0 after:content-['']">
              {tree.name}
            </Link>
          </h3>
          <p className="text-base text-ink-muted">
            {tree.peopleCount} {tree.peopleCount === 1 ? 'person' : 'people'}
          </p>
        </div>
      </div>
      {tree.description ? <p className="line-clamp-2 text-base text-ink-muted">{tree.description}</p> : null}
      <div className="mt-auto flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={tree.status} />
        {role ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 font-semibold text-ink-muted">
            <Icon name="users" className="size-4" />
            {role} · shared by {tree.owner.name}
          </span>
        ) : null}
        <span className="text-ink-muted">Edited {relativeTime(tree.updatedAt)}</span>
      </div>
    </li>
  );
}
