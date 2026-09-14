import { directRelatives } from '@kinfolk/shared/relatives/directRelatives';
import { planChangeKind, planDetachParentLink, planDetachPartner, planReparent, planUpdateUnion } from '@kinfolk/shared/relatives/planRelationshipEdits';
import type { ChangeOp } from '@kinfolk/shared/schemas/changeSet';
import type { ParentChildKind } from '@kinfolk/shared/schemas/parentChild';
import type { UnionStatus, UnionType } from '@kinfolk/shared/schemas/union';
import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, buttonClasses } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { FormAlert } from '../../../components/FormAlert';
import { Icon } from '../../../components/Icon';
import { InlineSelect } from '../../../components/InlineSelect';
import { commitWithUndo } from '../editing/changeQueue';
import { useTreeOutlet } from '../treeOutlet';
import { canEditTree } from '../treePermissions';
import { FormSection } from './FormSection';
import { PanelShell } from './PanelShell';
import { PersonNotFound } from './PersonNotFound';
import { ReadOnlyPanel } from './ReadOnlyPanel';
import { familyLabel, KIND_OPTIONS, UNION_STATUS_OPTIONS, UNION_TYPE_OPTIONS } from './relationshipWords';
import { UnionDatesForm } from './UnionDatesForm';

interface PendingDetach {
  title: string;
  body: string;
  ops: ChangeOp[];
  label: string;
}

/**
 * Fix relationships without deleting anyone (SPEC §4.6): change kind, move a child to another
 * family, edit a partnership's type, status, and years, or detach. Every change saves at once
 * and can be undone. Addressable at /trees/:treeId/people/:personId/relationships.
 */
export function Component() {
  const { personId = '' } = useParams();
  const { view, tree } = useTreeOutlet();
  const [error, setError] = useState<string | null>(null);
  const [detach, setDetach] = useState<PendingDetach | null>(null);
  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({});
  const alertRef = useRef<HTMLDivElement>(null);
  const person = view.index.person(personId);
  const relatives = useMemo(() => (person ? directRelatives(view.index, view.resolve, person.id) : null), [view.index, view.resolve, person]);
  const families = useMemo(
    () => view.graph.unions.map((union) => ({ value: union.id, label: familyLabel(view.names, union) })).sort((a, b) => a.label.localeCompare(b.label)),
    [view.graph.unions, view.names],
  );

  if (!person || !relatives) return <PersonNotFound treeId={tree.id} />;
  if (!canEditTree(tree)) return <ReadOnlyPanel tree={tree} personId={person.id} />;
  const name = view.names.get(person.id) ?? '';
  const nameOf = (id: string) => view.names.get(id) ?? 'Unnamed person';
  const panelUrl = `/trees/${tree.id}/people/${person.id}`;

  // Planning runs inside the try too: a planner refuses impossible edits with a plain message.
  const apply = (plan: () => ChangeOp[], label: string) => {
    setError(null);
    try {
      const ops = plan();
      if (ops.length === 0) return;
      void commitWithUndo(tree.id, ops, label, `${label}.`).catch(() => undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That change couldn’t be made.');
      requestAnimationFrame(() => alertRef.current?.focus());
    }
  };

  const hasAny = relatives.parentFamilies.length + relatives.partners.length + relatives.childFamilies.length > 0;

  return (
    <PanelShell
      title={`${person.firstName ? `${person.firstName}’s` : 'Their'} relationships`}
      subtitle="Changes save straight away. Use Undo if something goes wrong."
      back={{ to: panelUrl, label: `Back to ${name}` }}
      closeTo={panelUrl}
      closeLabel={`Close and return to ${name}`}
      wide
    >
      <div className="px-5 pt-4">
        <FormAlert message={error} alertRef={alertRef} />
      </div>
      {!hasAny ? (
        <p className="px-5 py-4 text-base">
          {name} isn’t connected to anyone yet.{' '}
          <Link to={`${panelUrl}/add`} className="font-semibold text-accent underline">
            Add a relative
          </Link>{' '}
          to connect them.
        </p>
      ) : null}

      {relatives.parentFamilies.length > 0 ? (
        <FormSection title="Parents">
          {relatives.parentFamilies.map((family) => {
            const parents = family.parents.map((parent) => `${parent.label}: ${nameOf(parent.personId)}`).join(' · ');
            const target = moveTargets[family.edge.id] ?? '';
            return (
              <div key={family.edge.id} className="flex flex-col gap-3 rounded-card border border-line p-4">
                <p className="text-base font-semibold">{parents}</p>
                <InlineSelect
                  label={`How ${name} is their child`}
                  value={family.edge.kind}
                  options={KIND_OPTIONS}
                  onChange={(kind) => apply(() => planChangeKind(family.edge.id, kind as ParentChildKind), `Changed ${name} to a ${kind === 'biological' ? 'birth' : kind} child of ${familyLabel(view.names, family.union)}`)}
                />
                <div className="flex flex-wrap items-end gap-2">
                  <InlineSelect
                    label="Move to different parents"
                    value={target}
                    options={[{ value: '', label: 'Choose a family…' }, ...families.filter((option) => option.value !== family.union.id)]}
                    onChange={(value) => setMoveTargets((current) => ({ ...current, [family.edge.id]: value }))}
                    className="min-w-0 flex-1"
                  />
                  <Button
                    onClick={() => {
                      if (!target) {
                        setError('Choose the family to move them to first.');
                        requestAnimationFrame(() => alertRef.current?.focus());
                        return;
                      }
                      const destination = view.index.union(target);
                      apply(() => planReparent(view.graph, family.edge.id, target), `Moved ${name} to ${destination ? familyLabel(view.names, destination) : 'another family'}`);
                      setMoveTargets((current) => ({ ...current, [family.edge.id]: '' }));
                    }}
                  >
                    Move
                  </Button>
                </div>
                <Button
                  variant="danger-quiet"
                  icon="unlink"
                  className="self-start"
                  onClick={() => apply(() => planDetachParentLink(view.graph, family.edge.id), `Detached ${name} from ${familyLabel(view.names, family.union)}`)}
                >
                  Detach from these parents
                </Button>
              </div>
            );
          })}
        </FormSection>
      ) : null}

      {relatives.partners.length > 0 ? (
        <FormSection title="Partners">
          {relatives.partners.map((partner) => {
            const partnerName = nameOf(partner.personId);
            const union = partner.union;
            const childCount = view.index.childEdgesOf(union.id).length;
            return (
              <div key={union.id} className="flex flex-col gap-3 rounded-card border border-line p-4">
                <p className="text-base font-semibold">
                  {partner.label}: {partnerName}
                  {partner.detail ? <span className="font-normal text-ink-muted"> ({partner.detail})</span> : null}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <InlineSelect
                    label="Type"
                    value={union.type}
                    options={UNION_TYPE_OPTIONS}
                    onChange={(value) => apply(() => planUpdateUnion(union.id, { type: value as UnionType }), `Changed ${name} and ${partnerName} to ${value === 'unknown' ? 'an unknown kind of partnership' : `a ${value}`}`)}
                  />
                  <InlineSelect
                    label="Status"
                    value={union.status}
                    options={UNION_STATUS_OPTIONS}
                    onChange={(value) =>
                      apply(() => planUpdateUnion(union.id, { status: value as UnionStatus }), `Marked ${name} and ${partnerName} as ${UNION_STATUS_OPTIONS.find((option) => option.value === value)?.label.toLowerCase()}`)
                    }
                  />
                </div>
                <UnionDatesForm key={`${union.id}-${union.startDate?.year}-${union.endDate?.year}`} union={union} idPrefix={`union-${union.id}`} onSave={(patch) => apply(() => planUpdateUnion(union.id, patch), `Changed the years for ${name} and ${partnerName}`)} />
                <Button
                  variant="danger-quiet"
                  icon="unlink"
                  className="self-start"
                  onClick={() => {
                    const ops = planDetachPartner(view.graph, union.id, partner.personId);
                    const label = `Detached ${partnerName} from ${name}`;
                    if (childCount === 0) {
                      apply(() => ops, label);
                      return;
                    }
                    setDetach({
                      title: `Detach ${partnerName}?`,
                      body: `${name} and ${partnerName} have ${childCount === 1 ? 'a child' : `${childCount} children`} together. Detaching keeps the ${childCount === 1 ? 'child' : 'children'} with ${name}, and ${partnerName} will no longer be shown as their parent.`,
                      ops,
                      label,
                    });
                  }}
                >
                  Detach partner
                </Button>
              </div>
            );
          })}
        </FormSection>
      ) : null}

      {relatives.childFamilies.length > 0 ? (
        <FormSection title="Children">
          {relatives.childFamilies.map((family) => (
            <div key={family.union.id} className="flex flex-col gap-3 rounded-card border border-line p-4">
              <p className="text-base font-semibold">{family.partner ? `With ${nameOf(family.partner.personId)}` : `${name} on their own`}</p>
              <ul className="flex flex-col gap-3">
                {family.children.map((child) => {
                  const childName = nameOf(child.personId);
                  return (
                    <li key={child.edge.id} className="flex flex-wrap items-end gap-2">
                      <InlineSelect
                        label={`${childName} (${child.label.toLowerCase()})`}
                        value={child.edge.kind}
                        options={KIND_OPTIONS}
                        onChange={(kind) => apply(() => planChangeKind(child.edge.id, kind as ParentChildKind), `Changed ${childName} to a ${kind === 'biological' ? 'birth' : kind} child`)}
                        className="min-w-0 flex-1"
                      />
                      <Button variant="danger-quiet" icon="unlink" onClick={() => apply(() => planDetachParentLink(view.graph, child.edge.id), `Detached ${childName} from ${familyLabel(view.names, family.union)}`)}>
                        {`Detach ${childName}`}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </FormSection>
      ) : null}

      <div className="px-5 py-4">
        <Link to={`${panelUrl}/add`} className={buttonClasses('secondary')}>
          <Icon name="user-plus" />
          Add a relative
        </Link>
      </div>

      <ConfirmDialog
        open={detach !== null}
        onOpenChange={(open) => !open && setDetach(null)}
        title={detach?.title ?? ''}
        confirmLabel="Detach"
        onConfirm={() => {
          if (detach) apply(() => detach.ops, detach.label);
        }}
      >
        <p>{detach?.body}</p>
        <p className="text-ink-muted">You can undo this right after.</p>
      </ConfirmDialog>
    </PanelShell>
  );
}
