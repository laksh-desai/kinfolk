import { addAccessSchema } from '@kinfolk/shared/schemas/collaboration';
import { Button } from '../../components/Button';
import { FormAlert } from '../../components/FormAlert';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { announce } from '../../lib/announcer';
import { queryClient } from '../../lib/queryClient';
import { toast } from '../../lib/toast';
import { useForm } from '../../lib/useForm';
import { accessQuery, collaborationApi } from './collaborationApi';

const INITIAL = { name: '', email: '', role: 'viewer' as const };

export const ROLE_OPTIONS = [
  { value: 'viewer', label: 'Viewer — can look, not change' },
  { value: 'editor', label: 'Editor — can add and edit people' },
];

/** Invite someone by name and email with a role (SPEC §5.6). They accept after signing in with that email. */
export function AddAccessForm({ treeId }: { treeId: string }) {
  const form = useForm({
    schema: addAccessSchema,
    initialValues: INITIAL,
    labels: { name: 'Name', email: 'Email', role: 'Role' },
    idPrefix: 'add-access',
    onSubmit: async (values) => {
      const { access } = await collaborationApi.addAccess(treeId, { name: values.name ?? undefined, email: values.email, role: values.role });
      await queryClient.invalidateQueries({ queryKey: accessQuery(treeId).queryKey });
      form.reset(INITIAL);
      const message = `Invitation sent to ${access.email}. They’ll get access once they accept.`;
      announce(message);
      toast({ title: 'Invitation sent', description: message, tone: 'success' });
      requestAnimationFrame(() => document.getElementById('add-access-email')?.focus());
    },
  });

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-3" aria-labelledby="add-access-heading">
      <h3 id="add-access-heading" className="text-base font-semibold">
        Invite someone
      </h3>
      <FormAlert message={form.formError} alertRef={form.formErrorRef} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField field={form.field('name')} label="Name" optionalMark autoComplete="off" />
        <TextField field={form.field('email')} label="Email" type="email" required autoComplete="off" />
        <SelectField field={form.field('role')} label="Role" options={ROLE_OPTIONS} required className="sm:col-span-2" />
      </div>
      <Button type="submit" variant="primary" icon="send" pending={form.submitting} pendingLabel="Sending…" className="self-start">
        Send invitation
      </Button>
    </form>
  );
}
