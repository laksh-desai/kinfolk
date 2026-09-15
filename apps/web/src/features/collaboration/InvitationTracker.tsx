import type { InvitationDto } from '@kinfolk/shared/schemas/collaboration';
import { Icon } from '../../components/Icon';
import { cx } from '../../lib/cx';

const STEPS = [
  { stage: 'sent', label: 'Invite sent', at: (invitation: InvitationDto) => invitation.sentAt },
  { stage: 'joined', label: 'Joined', at: (invitation: InvitationDto) => invitation.joinedAt },
  { stage: 'tree_created', label: 'Built their tree', at: (invitation: InvitationDto) => invitation.treeCreatedAt },
  { stage: 'linked', label: 'Linked', at: (invitation: InvitationDto) => invitation.linkedAt },
] as const;

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The four real stages of a relative invitation (SPEC §5.5), each with the time it happened. */
export function InvitationTracker({ invitation }: { invitation: InvitationDto }) {
  const reached = STEPS.findIndex((step) => step.stage === invitation.stage);
  return (
    <ol aria-label="Invitation progress" className="flex flex-col gap-3">
      {STEPS.map((step, position) => {
        const done = position <= reached;
        const at = step.at(invitation);
        return (
          <li key={step.stage} aria-current={position === reached ? 'step' : undefined} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={cx(
                'inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold',
                done ? 'border-accent bg-accent text-on-accent' : 'border-line-strong text-ink-muted',
              )}
            >
              {done ? <Icon name="check" className="size-4" /> : position + 1}
            </span>
            <div className="min-w-0">
              <p className={cx('font-semibold', !done && 'text-ink-muted')}>
                {step.label}
                <span className="sr-only">{done ? ' — done' : ' — not yet'}</span>
              </p>
              {done && at ? <p className="text-sm text-ink-muted">{when(at)}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
