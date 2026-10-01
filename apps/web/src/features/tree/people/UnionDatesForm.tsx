import type { Union, UnionPatch } from '@kinfolk/shared/schemas/union';
import { unionDatesSchema, unionDatesToPatch, unionToDatesValues } from '@kinfolk/shared/schemas/unionForm';
import { Button } from '../../../components/Button';
import { useForm } from '../../../lib/useForm';
import { DateFields } from './DateFields';

interface UnionDatesFormProps {
  union: Union;
  idPrefix: string;
  onSave: (patch: UnionPatch) => void;
}

/**
 * When a partnership began and ended, as whole dates (ADR 042): the month and day are what put
 * an anniversary on Key Events, so they are entered here, not only through import.
 */
export function UnionDatesForm({ union, idPrefix, onSave }: UnionDatesFormProps) {
  const form = useForm({
    schema: unionDatesSchema,
    initialValues: unionToDatesValues(union),
    labels: { startYear: 'Start year', startMonth: 'Start month', startDay: 'Start day', endYear: 'End year', endMonth: 'End month', endDay: 'End day' },
    idPrefix,
    onSubmit: (values) => {
      const patch = unionDatesToPatch(values);
      if (JSON.stringify(patch.startDate) === JSON.stringify(union.startDate) && JSON.stringify(patch.endDate) === JSON.stringify(union.endDate)) return;
      onSave(patch);
    },
  });
  const { values } = form;
  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DateFields
          prefix="start"
          idPrefix={idPrefix}
          legend={union.type === 'marriage' ? 'Married on' : 'Together since'}
          field={form.field}
          approximate={Boolean(values.startApproximate)}
          onApproximateChange={(checked) => form.setValue('startApproximate', checked)}
        />
        <DateFields prefix="end" idPrefix={idPrefix} legend="Ended on" field={form.field} approximate={Boolean(values.endApproximate)} onApproximateChange={(checked) => form.setValue('endApproximate', checked)} />
      </div>
      <Button type="submit" pending={form.submitting} pendingLabel="Saving…" className="self-start">
        Save dates
      </Button>
    </form>
  );
}
