import { planAddRelative, RELATION_KEYS, RELATIONS, type RelationKey, type Via } from '@kinfolk/shared/relatives/planAddRelative';
import { blankPerson, PlanError } from '@kinfolk/shared/relatives/planState';
import type { ParentChildKind } from '@kinfolk/shared/schemas/parentChild';
import { quickAddSchema, quickAddToFields, type QuickAddValues } from '@kinfolk/shared/schemas/personForm';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/Button';
import { CheckboxField } from '../../../components/CheckboxField';
import { FormAlert } from '../../../components/FormAlert';
import { RadioGroup } from '../../../components/RadioGroup';
import { announce } from '../../../lib/announcer';
import { useForm } from '../../../lib/useForm';
import { commitWithUndo } from '../editing/changeQueue';
import { useTreeOutlet } from '../treeOutlet';
import { canEditTree, newId } from '../treePermissions';
import { ConnectionQuestions } from './ConnectionQuestions';
import { PanelShell } from './PanelShell';
import { PersonNotFound } from './PersonNotFound';
import { QUICK_ADD_LABELS, QuickAddFields } from './QuickAddFields';
import { ReadOnlyPanel } from './ReadOnlyPanel';
import { resolveConnection, type ConnectionAnswers } from './resolveConnection';

const INHERITS_LAST_NAME = new Set<RelationKey>(['child', 'son', 'daughter', 'adopted-child', 'sibling', 'brother', 'sister', 'father', 'grandchild']);

// Relations that come in batches — five siblings, four children — keep the form open by default,
// so each is one name and one Enter (SPEC §5.3: "enter five siblings in a row without reopening").
const CHAINS_BY_DEFAULT = new Set<RelationKey>(['sibling', 'brother', 'sister', 'child', 'son', 'daughter', 'adopted-child']);

const PARENT_KINDS: Array<{ value: ParentChildKind; label: string }> = [
  { value: 'adopted', label: 'Adoptive parent' },
  { value: 'step', label: 'Step-parent' },
  { value: 'foster', label: 'Foster parent' },
  { value: 'guardian', label: 'Guardian' },
];

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/** The placeholder part of a plan summary: "an unnamed parent for Hari and …". */
function placeholderPhrase(summary: string): string | null {
  return /we also added (.+) — you can name/.exec(summary)?.[1] ?? null;
}

/**
 * Add relative (SPEC §4.2): pick how they connect (only when there's a real choice), then quick
 * add. The app resolves the relationship into graph edges, creating and naming any placeholders.
 * Addressable at /trees/:treeId/people/:personId/add/:relation.
 */
export function Component() {
  const { personId = '', relation: relationParam = '' } = useParams();
  const { view, tree } = useTreeOutlet();
  const navigate = useNavigate();
  const anchor = view.index.person(personId);
  const requested = (RELATION_KEYS as readonly string[]).includes(relationParam) ? (relationParam as RelationKey) : null;
  const spec = RELATIONS.find((entry) => entry.key === requested);
  // "Add partner" asks what kind of partnership; the choice picks the specific relation to plan.
  const [partnerKind, setPartnerKind] = useState<'spouse' | 'unmarried-partner' | 'former-spouse'>('spouse');
  const relation = requested === 'partner' ? partnerKind : requested;
  const [answers, setAnswers] = useState<ConnectionAnswers>({});
  const [siblingInLawVia, setSiblingInLawVia] = useState<'partner' | 'sibling'>('partner');
  const [kind, setKind] = useState<ParentChildKind>('adopted');
  const [addAnother, setAddAnother] = useState(() => Boolean(requested && CHAINS_BY_DEFAULT.has(requested)));
  /** Everyone added since the form opened, so a run of entries can be checked and revisited. */
  const [added, setAdded] = useState<Array<{ id: string; name: string }>>([]);
  const next = useRef<'panel' | 'details'>('panel');

  const connection = useMemo(
    () => (anchor && relation ? resolveConnection(view.graph, anchor.id, relation, answers, siblingInLawVia) : null),
    [view.graph, anchor, relation, answers, siblingInLawVia],
  );

  // Dry run with a blank person: tells the user which placeholders will be created, and whether
  // the relationship needs a different parent kind, before they type anything.
  const preview = useMemo(() => {
    if (!anchor || !relation || !connection) return null;
    const request = { anchorId: anchor.id, relation, person: blankPerson('00000000-0000-4000-8000-000000000000', { firstName: 'Someone' }), via: connection.via, siblingInLawVia };
    const attempt = (withKind?: ParentChildKind) => planAddRelative(view.graph, { ...request, kind: withKind }, { newId: () => crypto.randomUUID() });
    try {
      return { plan: attempt(connection.needsParentKind ? kind : undefined), askKind: connection.needsParentKind, error: null };
    } catch (error) {
      if (error instanceof PlanError && error.code === 'two_parents') {
        try {
          return { plan: attempt(kind), askKind: true, error: null };
        } catch (second) {
          return { plan: null, askKind: true, error: second instanceof Error ? second.message : String(second) };
        }
      }
      return { plan: null, askKind: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, [view.graph, anchor, relation, connection, kind, siblingInLawVia]);

  const initialValues: QuickAddValues = {
    firstName: '',
    lastName: relation && INHERITS_LAST_NAME.has(relation) ? (anchor?.lastName ?? '') : '',
    gender: spec?.gender ?? 'unknown',
    lifeStatus: 'living',
    birthDay: '',
    birthMonth: '',
    birthYear: '',
  };

  const form = useForm({
    schema: quickAddSchema,
    initialValues,
    labels: QUICK_ADD_LABELS,
    idPrefix: 'quick-add',
    onSubmit: (values) => {
      if (!anchor || !relation || !connection) return;
      const person = blankPerson(newId(), quickAddToFields(values));
      const plan = planAddRelative(
        view.graph,
        { anchorId: anchor.id, relation, person, via: connection.via, siblingInLawVia, kind: preview?.askKind ? kind : undefined },
        { newId },
      );
      void commitWithUndo(tree.id, plan.ops, plan.headline, plan.summary).catch(() => undefined);
      if (next.current === 'details') {
        navigate(`/trees/${tree.id}/people/${plan.personId}/edit`);
      } else if (addAnother) {
        const name = [values.firstName, values.lastName].filter(Boolean).join(' ').trim();
        setAdded((list) => [...list, { id: plan.personId, name }]);
        announce(`Added ${name}. Ready for the next ${spec?.label.toLowerCase() ?? 'person'}.`);
        form.reset(initialValues);
        requestAnimationFrame(() => document.getElementById('quick-add-firstName')?.focus());
      } else {
        navigate(`/trees/${tree.id}/people/${plan.personId}`);
      }
      next.current = 'panel';
    },
  });

  // A different person or relation starts fresh. Focus goes straight to the name field: the
  // connection questions above it already have sensible answers, and entry speed matters (SPEC §5.3).
  useEffect(() => {
    setAnswers({});
    setAddAnother(Boolean(requested && CHAINS_BY_DEFAULT.has(requested)));
    setAdded([]);
    form.reset(initialValues);
    document.getElementById('quick-add-firstName')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the URL names a different person or relation
  }, [requested, personId]);

  if (!anchor) return <PersonNotFound treeId={tree.id} />;
  const anchorName = view.names.get(anchor.id) ?? '';
  const back = { to: `/trees/${tree.id}/people/${anchor.id}/add`, label: 'All relationships' };
  if (!relation || !requested || !spec) {
    return (
      <PanelShell title="That relationship isn’t one we know" back={back} closeTo={`/trees/${tree.id}`} closeLabel="Close">
        <p className="px-5 py-4 text-base">Choose a relationship from the list instead.</p>
      </PanelShell>
    );
  }
  if (!canEditTree(tree)) return <ReadOnlyPanel tree={tree} personId={anchor.id} />;

  const word = spec.label.toLowerCase();
  const phrase = preview?.plan ? placeholderPhrase(preview.plan.summary) : null;
  const onAnswer = (key: keyof Via, value: string) => setAnswers((current) => ({ ...current, [key]: value }));
  // After a run of entries, closing lands on the last person added rather than back on the anchor.
  const last = added[added.length - 1];

  return (
    <PanelShell
      title={`Add ${article(word)} ${word}`}
      subtitle={`Related to ${anchorName}`}
      back={back}
      closeTo={`/trees/${tree.id}/people/${last ? last.id : anchor.id}`}
      closeLabel={`Close and return to ${last ? last.name : anchorName}`}
      focusKey={null}
      wide
    >
      <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5 px-5 py-4">
        <FormAlert message={form.formError} alertRef={form.formErrorRef} />
        {preview?.error ? (
          <p className="rounded-control border border-warning/50 bg-warning-soft px-3 py-2 text-base text-ink">{preview.error}</p>
        ) : null}
        {requested === 'partner' ? (
          <RadioGroup
            legend="What kind of partner?"
            name="partner-kind"
            value={partnerKind}
            onChange={(value) => setPartnerKind(value as typeof partnerKind)}
            options={[
              { value: 'spouse', label: 'Spouse', description: 'Married, now' },
              { value: 'unmarried-partner', label: 'Partner', description: 'Together, not married' },
              { value: 'former-spouse', label: 'Former spouse', description: 'Divorced — change to separated or widowed later under Relationships' },
            ]}
          />
        ) : null}
        {relation === 'sibling-in-law' ? (
          <RadioGroup
            legend="How are they related?"
            name="sibling-in-law-via"
            value={siblingInLawVia}
            onChange={(value) => setSiblingInLawVia(value === 'sibling' ? 'sibling' : 'partner')}
            options={[
              { value: 'partner', label: `A sibling of ${anchorName}’s partner` },
              { value: 'sibling', label: `The partner of ${anchorName}’s sibling` },
            ]}
          />
        ) : null}
        {connection ? <ConnectionQuestions steps={connection.steps} via={connection.via} onAnswer={onAnswer} /> : null}
        {preview?.askKind ? (
          <RadioGroup
            legend="What kind of parent?"
            hint="This person already has two birth parents recorded, so the new parent is added as another kind."
            name="parent-kind"
            value={kind}
            onChange={(value) => setKind(value as ParentChildKind)}
            options={PARENT_KINDS}
          />
        ) : null}
        {phrase ? (
          <p className="rounded-control border border-dashed border-line-strong px-3 py-2 text-base text-ink-muted">
            To connect them, this also adds {phrase}. You can name {preview?.plan?.placeholderIds.length === 1 ? 'it' : 'them'} anytime.
          </p>
        ) : null}
        <QuickAddFields field={form.field} />
        <CheckboxField id="quick-add-another" label={`Add another ${word} after this`} checked={addAnother} onChange={setAddAnother} hint="The form stays open so you can enter several in a row." />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" icon="user-plus" pending={form.submitting} pendingLabel="Adding…" onClick={() => (next.current = 'panel')}>
            {`Add ${word}`}
          </Button>
          <Button type="submit" onClick={() => (next.current = 'details')}>
            Add and fill in more details
          </Button>
        </div>
        {added.length > 0 ? (
          <section aria-labelledby="quick-add-added" className="rounded-control bg-sunken px-3 py-2">
            <h3 id="quick-add-added" className="text-sm font-semibold text-ink-muted">
              Added so far
            </h3>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {added.map((person) => (
                <li key={person.id}>
                  <Link to={`/trees/${tree.id}/people/${person.id}`} className="text-base text-accent underline-offset-2 hover:underline">
                    {person.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </form>
    </PanelShell>
  );
}

