import { createTreeSchema } from '@kinfolk/shared/schemas/tree';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { FormAlert } from '../../components/FormAlert';
import { TextAreaField } from '../../components/TextAreaField';
import { TextField } from '../../components/TextField';
import { queryClient } from '../../lib/queryClient';
import { toast } from '../../lib/toast';
import { useForm } from '../../lib/useForm';
import { treesApi, treesQuery } from './treesApi';

const INITIAL = { name: '', description: '' };

/** Create a tree, then land on it, where "Add the first person" is waiting. */
export function NewTreeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const form = useForm({
    schema: createTreeSchema,
    initialValues: INITIAL,
    labels: { name: 'Tree name', description: 'Description' },
    idPrefix: 'new-tree',
    onSubmit: async (values) => {
      const { tree } = await treesApi.create({ name: values.name, description: values.description ?? undefined });
      await queryClient.invalidateQueries({ queryKey: treesQuery.queryKey });
      onOpenChange(false);
      toast({ title: `Created ${tree.name}`, tone: 'success' });
      navigate(`/trees/${tree.id}`);
    },
  });

  useEffect(() => {
    if (!open) form.reset(INITIAL);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clear the form each time the dialog closes
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !form.submitting && onOpenChange(next)}
      title="New family tree"
      description="Usually named after the family, like “Sharma family”. You can rename it anytime."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="new-tree-form" variant="primary" pending={form.submitting} pendingLabel="Creating…">
            Create tree
          </Button>
        </>
      }
    >
      <form id="new-tree-form" noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
        <FormAlert message={form.formError} alertRef={form.formErrorRef} />
        <TextField field={form.field('name')} label="Tree name" required autoComplete="off" />
        <TextAreaField field={form.field('description')} label="Description" optionalMark hint="A note for anyone you share it with." rows={3} />
      </form>
    </Dialog>
  );
}
