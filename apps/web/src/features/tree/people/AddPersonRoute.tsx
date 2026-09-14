import { planAddDetached } from '@kinfolk/shared/relatives/planAddRelative';
import { blankPerson } from '@kinfolk/shared/relatives/planState';
import { quickAddSchema, quickAddToFields, type QuickAddValues } from '@kinfolk/shared/schemas/personForm';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/Button';
import { FormAlert } from '../../../components/FormAlert';
import { useForm } from '../../../lib/useForm';
import { commitWithUndo } from '../editing/changeQueue';
import { useTreeOutlet } from '../treeOutlet';
import { canEditTree, newId } from '../treePermissions';
import { PanelShell } from './PanelShell';
import { QUICK_ADD_LABELS, QuickAddFields } from './QuickAddFields';
import { ReadOnlyPanel } from './ReadOnlyPanel';

const INITIAL: QuickAddValues = { firstName: '', lastName: '', gender: 'unknown', lifeStatus: 'living', birthYear: '' };

/**
 * Adds someone with no relationship yet: the first person in a new tree, or a person to connect
 * later (SPEC §4.3). Addressable at /trees/:treeId/add.
 */
export function Component() {
  const { view, tree } = useTreeOutlet();
  const navigate = useNavigate();
  const first = view.graph.people.length === 0;

  const form = useForm({
    schema: quickAddSchema,
    initialValues: INITIAL,
    labels: QUICK_ADD_LABELS,
    idPrefix: 'quick-add',
    onSubmit: (values) => {
      const plan = planAddDetached(view.graph, blankPerson(newId(), quickAddToFields(values)), { newId });
      const name = values.firstName;
      void commitWithUndo(tree.id, plan.ops, first ? `Added ${name}` : `Added ${name} to the tree`, plan.summary).catch(() => undefined);
      navigate(`/trees/${tree.id}/people/${plan.personId}`, { state: { focusPanel: true } });
    },
  });

  useEffect(() => {
    document.getElementById('quick-add-firstName')?.focus();
  }, []);

  if (!canEditTree(tree)) return <ReadOnlyPanel tree={tree} />;

  return (
    <PanelShell
      title={first ? 'Add the first person' : 'Add a person'}
      subtitle={first ? 'Usually yourself, or the person this planning is for. Everyone else is added from them.' : 'Someone not connected to anyone yet. You can link them to relatives afterwards.'}
      closeTo={`/trees/${tree.id}`}
      closeLabel="Close"
      focusKey={null}
    >
      <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5 px-5 py-4">
        <FormAlert message={form.formError} alertRef={form.formErrorRef} />
        <QuickAddFields field={form.field} />
        <Button type="submit" variant="primary" icon="user-plus" pending={form.submitting} pendingLabel="Adding…" className="self-start">
          Add person
        </Button>
      </form>
    </PanelShell>
  );
}
