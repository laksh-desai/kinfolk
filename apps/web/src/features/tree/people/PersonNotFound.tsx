import { Link } from 'react-router-dom';
import { buttonClasses } from '../../../components/Button';

/** Shown in the panel when a URL names a person who isn't (or is no longer) in this tree. */
export function PersonNotFound({ treeId }: { treeId: string }) {
  return (
    <aside aria-labelledby="person-missing-heading" className="flex w-full flex-col gap-3 border-l border-line bg-surface p-5 md:max-w-sm">
      <h2 id="person-missing-heading" className="text-xl font-semibold">
        That person isn’t in this tree
      </h2>
      <p className="text-base text-ink-muted">They may have been removed, or the link is from a different family tree.</p>
      <Link to={`/trees/${treeId}`} className={buttonClasses('primary', 'self-start')}>
        Back to the whole tree
      </Link>
    </aside>
  );
}
