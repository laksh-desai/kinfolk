import { createTreeSchema, type TreeDto } from '@kinfolk/shared/schemas/tree';
import { useEffect, useRef } from 'react';
import { Button } from '../../../components/Button';
import { IconButton } from '../../../components/IconButton';
import { TextField } from '../../../components/TextField';
import { announce } from '../../../lib/announcer';
import { describeError } from '../../../lib/api';
import { toast } from '../../../lib/toast';
import { useForm } from '../../../lib/useForm';
import { storeTreeDetails, treesApi } from '../../dashboard/treesApi';

const renameSchema = createTreeSchema.pick({ name: true });

interface TreeTitleProps {
  tree: TreeDto;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}

/**
 * The tree's name. Owners rename it in place: one click on "Rename tree" opens the field with
 * the name selected (SPEC §6.3), Enter saves, Escape cancels, and the rename can be undone.
 */
export function TreeTitle({ tree, editing, onEditingChange }: TreeTitleProps) {
  const renameButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(editing);
  const form = useForm({
    schema: renameSchema,
    initialValues: { name: tree.name },
    labels: { name: 'Tree name' },
    idPrefix: 'rename-tree',
    onSubmit: async ({ name }) => {
      const previous = tree.name;
      if (name === previous) {
        onEditingChange(false);
        return;
      }
      const { tree: updated } = await treesApi.update(tree.id, { name });
      storeTreeDetails(updated);
      onEditingChange(false);
      announce(`Renamed to ${updated.name}`);
      toast({
        title: `Renamed to ${updated.name}`,
        tone: 'success',
        action: {
          label: 'Undo',
          altText: `Undo: rename back to ${previous}`,
          onAction: () => {
            treesApi
              .update(tree.id, { name: previous })
              .then(({ tree: restored }) => {
                storeTreeDetails(restored);
                announce(`Renamed back to ${restored.name}`);
              })
              .catch((error: unknown) => toast({ title: 'Couldn’t undo the rename', description: describeError(error), tone: 'error' }));
          },
        },
      });
    },
  });

  useEffect(() => {
    if (editing && !wasEditing.current) {
      form.reset({ name: tree.name });
      requestAnimationFrame(() => {
        const input = document.getElementById('rename-tree-name') as HTMLInputElement | null;
        input?.focus();
        input?.select();
      });
    }
    if (!editing && wasEditing.current) requestAnimationFrame(() => renameButton.current?.focus());
    wasEditing.current = editing;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to opening and closing only
  }, [editing]);

  if (editing) {
    return (
      <form noValidate onSubmit={form.handleSubmit} className="flex min-w-0 flex-wrap items-end gap-2">
        {/* The page keeps its main heading while the name is being edited. */}
        <h1 className="sr-only">{tree.name}</h1>
        <TextField
          field={form.field('name')}
          label="Tree name"
          required
          autoComplete="off"
          className="w-72 max-w-full"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onEditingChange(false);
            }
          }}
        />
        <Button type="submit" variant="primary" pending={form.submitting} pendingLabel="Saving…">
          Save name
        </Button>
        <Button onClick={() => onEditingChange(false)}>Cancel</Button>
        {form.formError ? (
          <div ref={form.formErrorRef} tabIndex={-1} className="basis-full text-sm font-semibold text-danger">
            {form.formError}
          </div>
        ) : null}
      </form>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <h1 className="min-w-0 truncate font-serif text-2xl font-semibold">{tree.name}</h1>
      {tree.role === 'owner' ? <IconButton ref={renameButton} icon="pencil" label="Rename tree" onClick={() => onEditingChange(true)} /> : null}
    </div>
  );
}
