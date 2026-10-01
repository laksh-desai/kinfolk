import type { TreeStatus } from '@kinfolk/shared/schemas/tree';
import type { ReactNode } from 'react';
import { StatusBadge } from '../../../components/StatusBadge';

interface TreePageHeaderProps {
  /** `header` where this is the page's banner (the reviewer's and the shared screens); `div` inside the app shell. */
  as?: 'div' | 'header';
  /** Before the title: the wordmark on screens outside the app shell. */
  leading?: ReactNode;
  /** The tree's name — the editable title in the app, a plain heading elsewhere. */
  title: ReactNode;
  /** Right after the title: the owner's settings menu. */
  afterTitle?: ReactNode;
  status: TreeStatus;
  /** Role, mode, or reviewing pills. */
  pills?: ReactNode;
  peopleCount?: number;
  /** The controls, on the right, wrapping below on narrow screens. */
  children?: ReactNode;
}

/**
 * The one header above a tree, on every screen that shows one: name, status, a pill or two, the
 * number of people, and the controls on the right.
 */
export function TreePageHeader({ as: Tag = 'div', leading, title, afterTitle, status, pills, peopleCount, children }: TreePageHeaderProps) {
  return (
    <Tag className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2 sm:px-6">
      {leading}
      {title}
      {afterTitle}
      <StatusBadge status={status} />
      {pills}
      {peopleCount !== undefined ? (
        <span className="text-base text-ink-muted">
          {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
        </span>
      ) : null}
      {children ? <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div> : null}
    </Tag>
  );
}
