import type { TreeStatus } from '@kinfolk/shared/schemas/tree';
import { cx } from '../lib/cx';

const STATUS: Record<TreeStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-sunken text-ink-muted border-line' },
  in_review: { label: 'In review', className: 'bg-info-soft text-info border-info/30' },
  changes_requested: { label: 'Changes requested', className: 'bg-warning-soft text-warning border-warning/30' },
  approved: { label: 'Approved', className: 'bg-success-soft text-success border-success/30' },
};

export function statusLabel(status: TreeStatus): string {
  return STATUS[status].label;
}

/** The tree's review status, always shown in words (never colour alone). */
export function StatusBadge({ status, className }: { status: TreeStatus; className?: string }) {
  const { label, className: tone } = STATUS[status];
  return (
    <span className={cx('inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap', tone, className)}>
      <span className="sr-only">Status: </span>
      {label}
    </span>
  );
}
