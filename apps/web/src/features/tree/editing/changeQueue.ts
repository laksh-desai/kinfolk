import { applyChangeSet, GraphValidationError } from '@kinfolk/shared/graph/applyChangeSet';
import type { ChangeOp, ChangeSetResult } from '@kinfolk/shared/schemas/changeSet';
import type { TreeStatus } from '@kinfolk/shared/schemas/tree';
import { api, ApiError } from '../../../lib/api';
import { announce } from '../../../lib/announcer';
import { queryClient } from '../../../lib/queryClient';
import { toast } from '../../../lib/toast';
import { treeGraphQuery, type TreeGraphResponse } from '../treeQueries';
import { clearPending, settlePending, trackPending } from './pendingChanges';
import { getTreeEditingState, pushHistory, useEditingStore, type HistoryEntry } from './editingStore';

export type ChangeKind = 'edit' | 'undo' | 'redo';

interface QueuedChange {
  ops: ChangeOp[];
  label: string;
  kind: ChangeKind;
  resolve: (result: ChangeSetResult) => void;
  reject: (error: unknown) => void;
}

const queues = new Map<string, QueuedChange[]>();
const running = new Set<string>();
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];

/** Thrown synchronously when a change is invalid before it is ever sent (cycle, missing person…). */
export class ChangeRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChangeRejectedError';
  }
}

function applyLocally(treeId: string, ops: ChangeOp[]): void {
  const key = treeGraphQuery(treeId).queryKey;
  const current = queryClient.getQueryData<TreeGraphResponse>(key);
  if (!current) return;
  try {
    const { graph } = applyChangeSet(current.graph, ops, { now: new Date().toISOString() });
    queryClient.setQueryData<TreeGraphResponse>(key, { ...current, graph });
  } catch (error) {
    if (error instanceof GraphValidationError) throw new ChangeRejectedError(error.message);
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForOnline(): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => window.addEventListener('online', () => resolve(), { once: true }));
}

async function drain(treeId: string): Promise<void> {
  if (running.has(treeId)) return;
  running.add(treeId);
  const store = useEditingStore.getState();
  try {
    const queue = queues.get(treeId) ?? [];
    while (queue.length > 0) {
      const change = queue[0] as QueuedChange;
      store.update(treeId, () => ({ status: 'saving', errorMessage: null }));
      let attempt = 0;
      for (;;) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          store.update(treeId, () => ({ status: 'offline', retryAt: null }));
          await waitForOnline();
          store.update(treeId, () => ({ status: 'saving' }));
        }
        try {
          const result = await api<ChangeSetResult>(`/api/trees/${treeId}/changes`, {
            method: 'POST',
            body: { ops: change.ops, description: change.label },
            timeoutMs: 60_000,
          });
          queue.shift();
          settlePending(treeId, change.ops);
          const key = treeGraphQuery(treeId).queryKey;
          const cached = queryClient.getQueryData<TreeGraphResponse>(key);
          if (cached) {
            queryClient.setQueryData<TreeGraphResponse>(key, {
              ...cached,
              tree: { ...cached.tree, version: result.version, status: result.treeStatus as TreeStatus },
            });
          }
          // The dashboard's summary (people count, last edited) is now out of date.
          void queryClient.invalidateQueries({ queryKey: ['trees'], refetchType: 'none' });
          store.update(treeId, (state) => {
            const entry = { label: change.label, ops: result.inverse };
            const history =
              change.kind === 'undo'
                ? { undo: state.undo, redo: pushHistory(state.redo, entry) }
                : change.kind === 'redo'
                  ? { undo: pushHistory(state.undo, entry), redo: state.redo }
                  : { undo: pushHistory(state.undo, entry), redo: [] };
            return { ...history, status: queue.length > 0 ? 'saving' : 'saved', lastSavedAt: Date.now(), pending: queue.length, retryAt: null };
          });
          change.resolve(result);
          break;
        } catch (error) {
          const transient = error instanceof ApiError && error.isTransient;
          if (transient) {
            if (error.kind === 'offline') {
              store.update(treeId, () => ({ status: 'offline', retryAt: null }));
              await waitForOnline();
              continue;
            }
            const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)] as number;
            attempt += 1;
            store.update(treeId, () => ({ status: 'retrying', retryAt: Date.now() + delay }));
            await sleep(delay);
            continue;
          }
          // The server refused the change: roll back to its truth and drop everything queued after it.
          const message = error instanceof ApiError ? error.message : 'That change couldn’t be saved.';
          const dropped = queue.splice(0, queue.length);
          clearPending(treeId);
          store.update(treeId, () => ({ status: 'error', errorMessage: message, pending: 0, retryAt: null }));
          // refetchQueries (not invalidate): the optimistic copy must be replaced even when no
          // screen is currently showing this tree.
          await queryClient.refetchQueries({ queryKey: treeGraphQuery(treeId).queryKey }).catch(() => undefined);
          toast({ title: 'That change wasn’t saved', description: message, tone: 'error' });
          announce(`That change wasn’t saved. ${message}`, 'assertive');
          for (const item of dropped) item.reject(error);
          return;
        }
      }
    }
  } finally {
    running.delete(treeId);
  }
}

/**
 * Applies a change to the on-screen tree immediately, then saves it in order. Resolves when the
 * server has it. Throws ChangeRejectedError synchronously if the change is invalid locally, so
 * forms can show the message beside the right field.
 */
export function commitChange(treeId: string, ops: ChangeOp[], label: string, kind: ChangeKind = 'edit'): Promise<ChangeSetResult> {
  applyLocally(treeId, ops);
  trackPending(treeId, ops);
  return new Promise((resolve, reject) => {
    const queue = queues.get(treeId) ?? [];
    queue.push({ ops, label, kind, resolve, reject });
    queues.set(treeId, queue);
    useEditingStore.getState().update(treeId, () => ({ pending: queue.length, status: 'saving' }));
    void drain(treeId);
  });
}

function replayHistory(treeId: string, stack: 'undo' | 'redo', entry: HistoryEntry): Promise<ChangeSetResult> | null {
  const store = useEditingStore.getState();
  store.update(treeId, (state) =>
    stack === 'undo' ? { undo: state.undo.filter((candidate) => candidate !== entry) } : { redo: state.redo.filter((candidate) => candidate !== entry) },
  );
  try {
    const saving = commitChange(treeId, entry.ops, entry.label, stack);
    announce(`${stack === 'undo' ? 'Undid' : 'Redid'}: ${entry.label}`);
    return saving;
  } catch (error) {
    // Later edits made this step impossible (say, the person it restores was since re-added).
    // Keep the entry out of history and say why, rather than failing silently.
    const message = error instanceof Error ? error.message : 'That step can no longer be applied.';
    toast({ title: stack === 'undo' ? `Couldn’t undo “${entry.label}”` : `Couldn’t redo “${entry.label}”`, description: message, tone: 'error' });
    announce(`${stack === 'undo' ? 'Couldn’t undo' : 'Couldn’t redo'}. ${message}`, 'assertive');
    return null;
  }
}

export function undoLast(treeId: string): Promise<ChangeSetResult> | null {
  const { undo } = getTreeEditingState(treeId);
  const entry = undo[undo.length - 1];
  return entry ? replayHistory(treeId, 'undo', entry) : null;
}

export function redoLast(treeId: string): Promise<ChangeSetResult> | null {
  const { redo } = getTreeEditingState(treeId);
  const entry = redo[redo.length - 1];
  return entry ? replayHistory(treeId, 'redo', entry) : null;
}

/** Undo one particular saved change (the Undo in its toast), even if other edits came after it. */
export function undoChange(treeId: string, result: ChangeSetResult): Promise<ChangeSetResult> | null {
  const entry = getTreeEditingState(treeId).undo.find((candidate) => candidate.ops === result.inverse);
  return entry ? replayHistory(treeId, 'undo', entry) : null;
}

/**
 * Commits a change and offers Undo in a toast once it has saved. Returns the save promise;
 * a rejection has already been explained to the user by the queue.
 */
export function commitWithUndo(treeId: string, ops: ChangeOp[], label: string, message: string): Promise<ChangeSetResult> {
  const saving = commitChange(treeId, ops, label);
  announce(message);
  void saving.then(
    (result) =>
      toast({
        title: message,
        tone: 'success',
        action: { label: 'Undo', altText: `Undo: ${label}`, onAction: () => void undoChange(treeId, result)?.catch(() => undefined) },
      }),
    () => undefined,
  );
  return saving;
}

/** For tests: forget queued work. */
export function resetChangeQueues(): void {
  queues.clear();
  running.clear();
  clearPending();
}
