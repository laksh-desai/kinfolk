import { changeRequestSchema } from '@kinfolk/shared/schemas/review';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { FormAlert } from '../../components/FormAlert';
import { TextAreaField } from '../../components/TextAreaField';
import { announce } from '../../lib/announcer';
import { describeError } from '../../lib/api';
import { toast } from '../../lib/toast';
import { useForm } from '../../lib/useForm';

interface ReviewDecisionFormProps {
  treeName: string;
  onApprove: () => Promise<void>;
  onRequestChanges: (body: string) => Promise<void>;
}

/** The reviewer's two decisions (SPEC §5.7). A change request needs real words, not a click. */
export function ReviewDecisionForm({ treeName, onApprove, onRequestChanges }: ReviewDecisionFormProps) {
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    schema: changeRequestSchema,
    initialValues: { body: '' },
    labels: { body: 'What needs changing' },
    idPrefix: 'request-changes',
    onSubmit: async ({ body }) => {
      await onRequestChanges(body);
      form.reset({ body: '' });
    },
  });

  const approve = async () => {
    setApproving(true);
    setError(null);
    try {
      await onApprove();
    } catch (caught) {
      setError(describeError(caught));
      announce(describeError(caught), 'assertive');
    } finally {
      setApproving(false);
    }
  };

  return (
    <section aria-labelledby="decision-heading" className="flex flex-col gap-4 border-t border-line px-5 py-4">
      <h2 id="decision-heading" className="text-lg font-semibold">
        Your decision
      </h2>
      <FormAlert message={error} />
      <Button variant="primary" icon="check" pending={approving} pendingLabel="Approving…" onClick={() => void approve()} className="self-start">
        Approve “{treeName}”
      </Button>
      <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-3">
        <FormAlert message={form.formError} alertRef={form.formErrorRef} />
        <TextAreaField
          field={form.field('body')}
          label="What needs changing"
          rows={4}
          hint="The owner sees this note on their tree and can reply by making the changes and resubmitting."
        />
        <Button type="submit" icon="send" pending={form.submitting} pendingLabel="Sending…" className="self-start">
          Request changes
        </Button>
      </form>
    </section>
  );
}

export function notifyDecision(message: string): void {
  announce(message);
  toast({ title: message, tone: 'success' });
}
