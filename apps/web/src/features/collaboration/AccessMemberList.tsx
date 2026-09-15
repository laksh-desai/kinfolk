import type { AccessDto, AccessListDto, AccessRole } from '@kinfolk/shared/schemas/collaboration';
import { useId, useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { inputClasses } from '../../components/fieldStyles';
import { describeError } from '../../lib/api';
import { announce } from '../../lib/announcer';
import { cx } from '../../lib/cx';
import { queryClient } from '../../lib/queryClient';
import { relativeTime } from '../../lib/relativeTime';
import { toast } from '../../lib/toast';
import { accessQuery, collaborationApi } from './collaborationApi';

type SortKey = 'name' | 'email' | 'role';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'role', label: 'Role' },
];

const label = (member: Pick<AccessDto, 'name' | 'email'>) => member.name || member.email || 'Someone with access';

/** Who has access: searchable, sortable, role changeable inline, revocable with confirmation (SPEC §5.6). */
export function AccessMemberList({ treeId, list }: { treeId: string; list: AccessListDto }) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [revoking, setRevoking] = useState<AccessDto | null>(null);

  const members = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return list.members
      .filter((member) => !needle || `${member.name ?? ''} ${member.email ?? ''}`.toLowerCase().includes(needle))
      .sort((a, b) => (sort === 'role' ? a.role.localeCompare(b.role) : 0) || (sort === 'email' ? (a.email ?? '').localeCompare(b.email ?? '') : label(a).localeCompare(label(b))));
  }, [list.members, query, sort]);

  const changeRole = async (member: AccessDto, role: AccessRole) => {
    try {
      await collaborationApi.changeRole(treeId, member.id, role);
      await queryClient.invalidateQueries({ queryKey: accessQuery(treeId).queryKey });
      announce(`${label(member)} is now ${role === 'editor' ? 'an editor' : 'a viewer'}.`);
    } catch (error) {
      toast({ title: 'Role not changed', description: describeError(error), tone: 'error' });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor={searchId} className="mb-1 block text-sm font-semibold text-ink-muted">
            Search people with access
          </label>
          <input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} className={inputClasses(false)} autoComplete="off" />
        </div>
        <div role="group" aria-label="Sort by" className="inline-flex overflow-hidden rounded-control border border-line-strong">
          {SORTS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={sort === option.key}
              onClick={() => setSort(option.key)}
              className={cx('min-h-11 px-3 text-sm font-semibold', sort === option.key ? 'bg-accent text-on-accent' : 'bg-surface text-ink hover:bg-sunken')}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <ul aria-label="People with access" className="flex flex-col divide-y divide-line rounded-card border border-line">
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <div className="min-w-0 flex-1 basis-48">
            <p className="break-words font-semibold">{list.owner.name}</p>
            {list.owner.email ? <p className="break-all text-sm text-ink-muted">{list.owner.email}</p> : null}
          </div>
          <span className="text-sm font-semibold text-ink-muted">Owner</span>
        </li>
        {members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1 basis-48">
              <p className="break-words font-semibold">{label(member)}</p>
              <p className="break-all text-sm text-ink-muted">
                {member.name && member.email ? `${member.email} · ` : ''}
                {member.status === 'invited' ? `Invited ${relativeTime(member.invitedAt)}, not accepted yet` : `Joined ${relativeTime(member.acceptedAt ?? member.invitedAt)}`}
              </p>
            </div>
            {list.canManage ? (
              <>
                <select
                  aria-label={`Role for ${label(member)}`}
                  value={member.role}
                  onChange={(event) => void changeRole(member, event.target.value as AccessRole)}
                  className={inputClasses(false, 'w-auto pr-8')}
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <Button variant="danger-quiet" onClick={() => setRevoking(member)} aria-label={`Remove access for ${label(member)}`}>
                  Remove
                </Button>
              </>
            ) : (
              <span className="text-sm font-semibold capitalize text-ink-muted">{member.role}</span>
            )}
          </li>
        ))}
      </ul>
      {list.members.length === 0 ? <p className="text-base text-ink-muted">Only the owner has access so far.</p> : null}
      {list.members.length > 0 && members.length === 0 ? (
        <p role="status" className="text-base text-ink-muted">
          No one with access matches “{query}”.
        </p>
      ) : null}

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={revoking ? `Remove ${label(revoking)}’s access?` : 'Remove access?'}
        confirmLabel="Remove access"
        pendingLabel="Removing…"
        onConfirm={async () => {
          if (!revoking) return;
          await collaborationApi.revokeAccess(treeId, revoking.id);
          await queryClient.invalidateQueries({ queryKey: accessQuery(treeId).queryKey });
          toast({ title: `Removed ${label(revoking)}`, tone: 'neutral' });
        }}
      >
        <p>They won’t be able to open this family tree any more. You can invite them again later.</p>
      </ConfirmDialog>
    </div>
  );
}
