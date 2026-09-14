import { mergeConflicts, planMerge, type MergeField } from '@kinfolk/shared/relatives/planMerge';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, buttonClasses } from '../../../components/Button';
import { FormAlert } from '../../../components/FormAlert';
import { RadioGroup } from '../../../components/RadioGroup';
import { commitWithUndo } from '../editing/changeQueue';
import { useTreeOutlet } from '../treeOutlet';
import { canEditTree, canSeePlanning, newId } from '../treePermissions';
import { MERGE_FIELD_LABELS, mergeFieldText } from './mergeFieldWords';
import { PanelShell } from './PanelShell';
import { PersonNotFound } from './PersonNotFound';
import { ReadOnlyPanel } from './ReadOnlyPanel';

/**
 * Merge two records of the same person (SPEC §4.6) with field-by-field conflict resolution.
 * Relationships from both are combined. Addressable at /trees/:treeId/people/:personId/merge/:otherId.
 */
export function Component() {
  const { personId = '', otherId = '' } = useParams();
  const { view, tree } = useTreeOutlet();
  const navigate = useNavigate();
  const [keepSide, setKeepSide] = useState<'this' | 'other'>('this');
  const [choices, setChoices] = useState<Partial<Record<MergeField, 'keep' | 'other'>>>({});
  const [error, setError] = useState<string | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const first = view.graph.people.find((candidate) => candidate.id === personId);
  const second = view.graph.people.find((candidate) => candidate.id === otherId);
  const keep = keepSide === 'this' ? first : second;
  const drop = keepSide === 'this' ? second : first;
  const includePlanning = canSeePlanning(tree);
  const conflicts = useMemo(() => (keep && drop ? mergeConflicts(keep, drop).filter((field) => includePlanning || field !== 'planning') : []), [keep, drop, includePlanning]);

  if (!first) return <PersonNotFound treeId={tree.id} />;
  const firstName = view.names.get(first.id) ?? '';
  const panelUrl = `/trees/${tree.id}/people/${first.id}`;
  if (!canEditTree(tree)) return <ReadOnlyPanel tree={tree} personId={first.id} />;
  if (!second || second.id === first.id || !keep || !drop) {
    return (
      <PanelShell title="Choose who to merge with" back={{ to: `${panelUrl}/merge`, label: 'Choose someone else' }} closeTo={panelUrl} closeLabel={`Close and return to ${firstName}`}>
        <div className="flex flex-col gap-3 px-5 py-4 text-base">
          <p>{second?.id === first.id ? 'A person can’t be merged with themselves.' : 'That person isn’t in this tree any more.'}</p>
          <Link to={`${panelUrl}/merge`} className={buttonClasses('primary', 'self-start')}>
            Choose someone to merge with
          </Link>
        </div>
      </PanelShell>
    );
  }

  const nameOf = (id: string) => view.names.get(id) ?? 'Unnamed person';
  const keepName = nameOf(keep.id);
  const dropName = nameOf(drop.id);
  let preview: ReturnType<typeof planMerge> | null = null;
  let planError: string | null = null;
  try {
    preview = planMerge(view.graph, keep.id, drop.id, choices, { newId }, { includePlanning });
  } catch (caught) {
    planError = caught instanceof Error ? caught.message : 'These two records can’t be merged.';
  }

  const merge = () => {
    setError(null);
    try {
      const plan = planMerge(view.graph, keep.id, drop.id, choices, { newId }, { includePlanning });
      void commitWithUndo(tree.id, plan.ops, `Merged ${dropName} into ${keepName}`, `Merged ${dropName} into ${keepName}. Their relationships are now combined.`).catch(() => undefined);
      navigate(`/trees/${tree.id}/people/${keep.id}`, { replace: true, state: { focusPanel: true } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'These two records can’t be merged.');
      requestAnimationFrame(() => alertRef.current?.focus());
    }
  };

  return (
    <PanelShell
      title={`Merge ${firstName} and ${nameOf(second.id)}`}
      subtitle="One record is kept. Relationships from both are combined, and the other record is removed."
      back={{ to: `${panelUrl}/merge`, label: 'Choose someone else' }}
      closeTo={panelUrl}
      closeLabel={`Close without merging and return to ${firstName}`}
      wide
      footer={
        <>
          <Button variant="primary" icon="merge" onClick={merge} aria-disabled={planError ? true : undefined}>
            Merge into {keepName}
          </Button>
          <Link to={panelUrl} className={buttonClasses('secondary')}>
            Cancel
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-5 px-5 py-4 text-base">
        <FormAlert message={error ?? planError} alertRef={alertRef} />
        <RadioGroup
          legend="Which record should stay?"
          hint="Its details win wherever you don’t choose otherwise below. Empty details are filled in from the other record."
          name="merge-keep"
          value={keepSide}
          onChange={(value) => {
            setKeepSide(value === 'other' ? 'other' : 'this');
            setChoices({});
          }}
          options={[
            { value: 'this', label: firstName, description: view.relationToFocus.get(first.id)?.label },
            { value: 'other', label: nameOf(second.id), description: view.relationToFocus.get(second.id)?.label },
          ]}
        />
        {conflicts.length === 0 ? (
          <p className="rounded-control bg-sunken px-3 py-2">No details conflict. Anything missing from {keepName} is filled in from {dropName}.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold">
              {conflicts.length === 1 ? 'One detail differs' : `${conflicts.length} details differ`} — choose which to keep
            </h3>
            {conflicts.map((field) => (
              <RadioGroup
                key={field}
                legend={MERGE_FIELD_LABELS[field]}
                name={`merge-${field}`}
                value={choices[field] ?? 'keep'}
                onChange={(value) => setChoices((current) => ({ ...current, [field]: value === 'other' ? 'other' : 'keep' }))}
                options={[
                  { value: 'keep', label: mergeFieldText(keep, field), description: `From ${keepName}` },
                  { value: 'other', label: mergeFieldText(drop, field), description: `From ${dropName}` },
                ]}
              />
            ))}
          </div>
        )}
        {preview && preview.dropped.length > 0 ? (
          <div className="rounded-control border border-warning/50 bg-warning-soft px-3 py-2">
            <p className="font-semibold">Some links can’t be carried over:</p>
            <ul className="list-disc pl-5">
              {preview.dropped.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="text-ink-muted">You can undo the merge right after.</p>
      </div>
    </PanelShell>
  );
}
