import type { TreeDto } from '@kinfolk/shared/schemas/tree';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { ApiError } from '../../../lib/api';
import { toast } from '../../../lib/toast';
import { forgetTree, treesApi } from '../../dashboard/treesApi';

interface DeleteTreeDialogProps {
  tree: TreeDto;
  peopleCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Deleting a whole tree needs its name typed exactly (SPEC §6.24), and says what goes with it. */
export function DeleteTreeDialog({ tree, peopleCount, open, onOpenChange }: DeleteTreeDialogProps) {
  const navigate = useNavigate();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${tree.name}?`}
      confirmLabel="Delete this tree"
      pendingLabel="Deleting…"
      typeToConfirm={{ text: tree.name, label: `Type “${tree.name}” to confirm` }}
      onConfirm={async () => {
        try {
          await treesApi.remove(tree.id, tree.name);
        } catch (error) {
          // The server words a mismatch for the field; show the same words in the dialog.
          if (error instanceof ApiError && error.fields.confirmName) throw new Error(error.fields.confirmName);
          throw error;
        }
        forgetTree(tree.id);
        navigate('/', { replace: true });
        toast({ title: `Deleted ${tree.name}`, tone: 'neutral' });
      }}
    >
      <p>This permanently deletes:</p>
      <ul className="list-disc pl-5">
        <li>
          {peopleCount} {peopleCount === 1 ? 'person' : 'people'}, their details, and photos
        </li>
        <li>every relationship in the tree</li>
        <li>access for anyone it’s shared with, share links, and review requests</li>
      </ul>
      <p className="font-semibold">This can’t be undone.</p>
    </ConfirmDialog>
  );
}
