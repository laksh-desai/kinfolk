import type { TreeStatus } from '@kinfolk/shared/schemas/tree';
import { Pill } from './Pill';

const STATUS: Record<TreeStatus, { label: string; tone: 'muted' | 'info' | 'warning' | 'success' }> = {
  draft: { label: 'Draft', tone: 'muted' },
  in_review: { label: 'In review', tone: 'info' },
  changes_requested: { label: 'Changes requested', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
};

export function statusLabel(status: TreeStatus): string {
  return STATUS[status].label;
}

/** The tree's review status, always shown in words (never colour alone). */
export function StatusBadge({ status, className }: { status: TreeStatus; className?: string }) {
  const { label, tone } = STATUS[status];
  return (
    <Pill tone={tone} className={className}>
      <span className="sr-only">Status: </span>
      {label}
    </Pill>
  );
}
