import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../../../components/Icon';
import { cx } from '../../../lib/cx';
import type { TreeViewPreference } from '../../../lib/preferences';

interface ViewSwitchProps {
  view: TreeViewPreference;
  /** Where each option leads. By default the current URL with `view` set; public screens pass their own. */
  hrefFor?: (view: TreeViewPreference) => string;
}

/** Tree or list: the same people and actions either way (SPEC §5.3). The choice lives in the URL. */
export function ViewSwitch({ view, hrefFor }: ViewSwitchProps) {
  const location = useLocation();
  const linkFor = (target: TreeViewPreference) => {
    if (hrefFor) return hrefFor(target);
    const params = new URLSearchParams(location.search);
    params.set('view', target);
    return `${location.pathname}?${params}`;
  };
  const item = (target: TreeViewPreference, label: string, icon: 'tree' | 'list') => (
    <Link
      to={linkFor(target)}
      replace
      aria-current={view === target ? 'page' : undefined}
      className={cx(
        'inline-flex min-h-11 items-center gap-2 px-3 text-base font-semibold',
        view === target ? 'bg-accent text-on-accent' : 'bg-surface text-ink hover:bg-sunken',
      )}
    >
      <Icon name={icon} />
      {label}
    </Link>
  );
  return (
    <nav aria-label="Tree view" className="inline-flex overflow-hidden rounded-control border border-line-strong">
      {item('canvas', 'Tree', 'tree')}
      {item('list', 'List', 'list')}
    </nav>
  );
}
