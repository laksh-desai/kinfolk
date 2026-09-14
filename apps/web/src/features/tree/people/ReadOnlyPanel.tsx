import type { TreeDto } from '@kinfolk/shared/schemas/tree';
import { Link } from 'react-router-dom';
import { buttonClasses } from '../../../components/Button';
import { readOnlyReason } from '../treePermissions';
import { PanelShell } from './PanelShell';

/** An editing URL opened by someone who can't edit right now: explain why, and offer the way back. */
export function ReadOnlyPanel({ tree, personId }: { tree: TreeDto; personId?: string }) {
  const back = personId ? `/trees/${tree.id}/people/${personId}` : `/trees/${tree.id}`;
  return (
    <PanelShell title="Editing isn’t available" closeTo={`/trees/${tree.id}`} closeLabel="Close">
      <div className="flex flex-col gap-4 px-5 py-4 text-base">
        <p>{readOnlyReason(tree)}</p>
        <Link to={back} className={buttonClasses('primary', 'self-start')}>
          {personId ? 'Back to their details' : 'Back to the tree'}
        </Link>
      </div>
    </PanelShell>
  );
}
