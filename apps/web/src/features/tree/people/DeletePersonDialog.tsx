import { deletionImpact, planDeletePerson, type DeleteMode } from '@kinfolk/shared/relatives/planDeletePerson';
import type { TreeDto } from '@kinfolk/shared/schemas/tree';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { RadioGroup } from '../../../components/RadioGroup';
import { commitWithUndo } from '../editing/changeQueue';
import { canSeePlanning } from '../treePermissions';
import type { TreeView } from '../useTreeView';

interface DeletePersonDialogProps {
  tree: TreeDto;
  view: TreeView;
  personId: string | null;
  onClose: () => void;
}

const MAX_LISTED = 12;

function NameList({ names }: { names: string[] }) {
  const shown = names.slice(0, MAX_LISTED);
  return (
    <ul className="list-disc space-y-0.5 pl-5">
      {shown.map((name, position) => (
        // Names can repeat ("Ravi’s child — unnamed"), so the position is part of the key.
        <li key={`${position}-${name}`}>{name}</li>
      ))}
      {names.length > shown.length ? <li>and {names.length - shown.length} more</li> : null}
    </ul>
  );
}

/**
 * Person deletion (SPEC §3, §6.24): names every relationship that changes, never orphans a
 * subtree, and is undoable from the toast that follows.
 */
export function DeletePersonDialog({ tree, view, personId, onClose }: DeletePersonDialogProps) {
  const navigate = useNavigate();
  const person = personId ? view.index.person(personId) : undefined;
  const impact = useMemo(() => (person ? deletionImpact(view.graph, person.id) : null), [view.graph, person]);
  const [mode, setMode] = useState<DeleteMode>('remove');

  useEffect(() => {
    if (impact) setMode(impact.modes[0] ?? 'remove');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset the choice only when a different person is opened
  }, [personId]);

  if (!person || !impact) return null;
  const name = impact.name;
  const includePlanning = canSeePlanning(tree);
  const chosen = impact.modes.includes(mode) ? mode : (impact.modes[0] ?? 'remove');
  const ops = planDeletePerson(view.graph, person.id, chosen, { includePlanning });
  const focusOp = ops.find((op) => op.op === 'tree.setFocus');
  const newFocus = focusOp && focusOp.op === 'tree.setFocus' && focusOp.personId ? view.names.get(focusOp.personId) : null;
  const count = impact.descendants.length;

  const options = impact.modes.map((candidate) => {
    switch (candidate) {
      case 'remove':
        return { value: candidate, label: `Remove ${name}`, description: 'Their relationships are removed. Everyone else stays in the tree.' };
      case 'placeholder':
        return {
          value: candidate,
          label: 'Replace with an unnamed placeholder',
          description: 'Their details are cleared but every relationship stays, so the people connected through them remain connected.',
        };
      default:
        return { value: candidate, label: `Delete ${name} and ${count === 1 ? 'their 1 descendant' : `all ${count} descendants`}`, description: 'Removes the whole branch below them.' };
    }
  });

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Delete ${name}?`}
      confirmLabel={chosen === 'placeholder' ? 'Replace with placeholder' : chosen === 'with-descendants' ? `Delete ${count + 1} people` : `Delete ${name}`}
      pendingLabel="Deleting…"
      onConfirm={() => {
        const label = chosen === 'placeholder' ? `Replaced ${name} with a placeholder` : chosen === 'with-descendants' ? `Deleted ${name} and ${count} descendants` : `Deleted ${name}`;
        void commitWithUndo(tree.id, ops, label, `${label}.`).catch(() => undefined);
        if (chosen !== 'placeholder') navigate(`/trees/${tree.id}`, { replace: true });
      }}
    >
      {impact.relationships.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="font-semibold">These relationships will change:</p>
          <NameList names={impact.relationships} />
        </div>
      ) : (
        <p>{name} has no relationships in this tree yet.</p>
      )}
      {impact.wouldOrphan.length > 0 ? (
        <p className="rounded-control bg-warning-soft px-3 py-2 text-ink">
          {impact.wouldOrphan.map((child) => child.name).join(', ')} {impact.wouldOrphan.length === 1 ? 'has' : 'have'} no other parent in the tree, so {name}{' '}
          can’t simply be removed.
        </p>
      ) : null}
      {options.length > 1 ? <RadioGroup legend="What should happen?" name="delete-mode" value={chosen} options={options} onChange={(value) => setMode(value as DeleteMode)} /> : null}
      {chosen === 'with-descendants' ? (
        <div className="flex flex-col gap-1">
          <p className="font-semibold">Also deleted:</p>
          <NameList names={impact.descendants.map((descendant) => descendant.name)} />
        </div>
      ) : null}
      {newFocus ? <p>{name} is the focus person. Relationship labels will be shown relative to {newFocus} instead.</p> : null}
      <p className="text-ink-muted">You can undo this right after.</p>
    </ConfirmDialog>
  );
}
