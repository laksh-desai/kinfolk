import { submitReviewSchema } from '@kinfolk/shared/schemas/review';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { FormAlert } from '../../components/FormAlert';
import { TextAreaField } from '../../components/TextAreaField';
import { TextField } from '../../components/TextField';
import { announce } from '../../lib/announcer';
import { queryClient } from '../../lib/queryClient';
import { toast } from '../../lib/toast';
import { useForm } from '../../lib/useForm';
import { treesQuery } from '../dashboard/treesApi';
import { useTreeOutlet } from '../tree/treeOutlet';
import { treeGraphQuery } from '../tree/treeQueries';
import { reviewApi, reviewStateQuery } from './reviewApi';

const INITIAL = { reviewerEmail: '', note: '' };

/**
 * Send a tree to a professional for review (SPEC §5.7), addressable at /trees/:treeId/review.
 * Says plainly what submitting does before it happens.
 */
export function Component() {
  const { tree } = useTreeOutlet();
  const navigate = useNavigate();
  const state = useQuery({ ...reviewStateQuery(tree.id), enabled: tree.role === 'owner' });
  const close = () => navigate(`/trees/${tree.id}`);

  const form = useForm({
    schema: submitReviewSchema,
    initialValues: { ...INITIAL, reviewerEmail: state.data?.assignment?.reviewerEmail ?? '' },
    labels: { reviewerEmail: 'Reviewer’s email', note: 'Note for your reviewer' },
    idPrefix: 'submit-review',
    onSubmit: async (values) => {
      await reviewApi.submit(tree.id, { reviewerEmail: values.reviewerEmail, note: values.note ?? undefined });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: reviewStateQuery(tree.id).queryKey }),
        queryClient.refetchQueries({ queryKey: treeGraphQuery(tree.id).queryKey }),
        queryClient.invalidateQueries({ queryKey: treesQuery.queryKey }),
      ]);
      announce(`Sent to ${values.reviewerEmail} for review. Editing is paused until they respond.`);
      toast({ title: 'Sent for review', description: `We emailed ${values.reviewerEmail} a link to your family tree.`, tone: 'success' });
      close();
    },
  });

  if (tree.role !== 'owner') {
    return (
      <Dialog open onOpenChange={(open) => !open && close()} title="Send for review" size="sm">
        <p className="text-base">Only the owner of “{tree.name}” can send it for review.</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={`Send “${tree.name}” for review`}
      description="Your reviewer gets a link to read the tree, including the planning answers, and can approve it or ask for changes."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="submit-review-form" variant="primary" icon="send" pending={form.submitting} pendingLabel="Sending…">
            Send for review
          </Button>
        </>
      }
    >
      <form id="submit-review-form" noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
        <FormAlert message={form.formError} alertRef={form.formErrorRef} />
        <TextField field={form.field('reviewerEmail')} label="Reviewer’s email" type="email" required autoComplete="off" hint="Usually your adviser, trustee, or estate planner." />
        <TextAreaField field={form.field('note')} label="Note for your reviewer" optionalMark rows={3} hint="Anything you'd like them to look at first." />
        <p className="rounded-control bg-sunken px-3 py-2 text-base">
          While it’s with them, editing is paused for everyone, so they see a stable record. You can withdraw it at any time.
        </p>
      </form>
    </Dialog>
  );
}
