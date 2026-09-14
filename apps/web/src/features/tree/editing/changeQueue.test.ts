import type { ChangeOp } from '@kinfolk/shared/schemas/changeSet';
import { blankPerson } from '@kinfolk/shared/relatives/planState';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../../lib/queryClient';
import { mockApi } from '../../../test/mockApi';
import { seedResponse, TREE_ID } from '../../../test/treeFixtures';
import { treeGraphQuery, type TreeGraphResponse } from '../treeQueries';
import { ChangeRejectedError, commitChange, redoLast, resetChangeQueues, undoLast } from './changeQueue';
import { getTreeEditingState, HISTORY_LIMIT, useEditingStore } from './editingStore';

const key = treeGraphQuery(TREE_ID).queryKey;
const graph = () => queryClient.getQueryData<TreeGraphResponse>(key)!.graph;
const newPerson = (n: number): ChangeOp => ({ op: 'person.create', person: blankPerson(`abababab-0000-4000-8000-${n.toString().padStart(12, '0')}`, { firstName: `New ${n}` }) });

beforeEach(() => {
  resetChangeQueues();
  useEditingStore.getState().reset(TREE_ID);
  queryClient.clear();
  queryClient.setQueryData(key, seedResponse().body);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('change queue', () => {
  it('shows the change immediately, then records the server’s inverse for undo', async () => {
    const api = mockApi({
      [`POST /api/trees/${TREE_ID}/changes`]: () => ({ body: { version: 2, treeStatus: 'draft', inverse: [{ op: 'person.delete', id: 'abababab-0000-4000-8000-000000000001' }] } }),
    });
    queryClient.setQueryData(['trees'], []);
    const saved = commitChange(TREE_ID, [newPerson(1)], 'Added New 1');
    expect(graph().people.some((person) => person.firstName === 'New 1')).toBe(true);
    expect(getTreeEditingState(TREE_ID).status).toBe('saving');
    await saved;
    expect(getTreeEditingState(TREE_ID)).toMatchObject({ status: 'saved', pending: 0 });
    expect(getTreeEditingState(TREE_ID).undo).toEqual([{ label: 'Added New 1', ops: [{ op: 'person.delete', id: 'abababab-0000-4000-8000-000000000001' }] }]);
    expect(queryClient.getQueryData<TreeGraphResponse>(key)?.tree.version).toBe(2);
    // The dashboard's people count and "edited" time are refreshed next time they're shown.
    expect(queryClient.getQueryState(['trees'])?.isInvalidated).toBe(true);
    expect(api.calls.find((call) => call.method === 'POST')?.body).toMatchObject({ description: 'Added New 1' });
  });

  it('refuses an invalid change before sending it, with the plain message', () => {
    const api = mockApi({});
    const { seed } = seedResponse();
    expect(() => commitChange(TREE_ID, [{ op: 'person.delete', id: seed.people.vikram.id }], 'Delete')).toThrow(ChangeRejectedError);
    expect(api.calls).toHaveLength(0);
  });

  it('saves changes strictly in order', async () => {
    const order: string[] = [];
    mockApi({
      [`POST /api/trees/${TREE_ID}/changes`]: (request) => {
        order.push((request.body as { description: string }).description);
        return { body: { version: order.length + 1, treeStatus: 'draft', inverse: [] } };
      },
    });
    await Promise.all([commitChange(TREE_ID, [newPerson(1)], 'first'), commitChange(TREE_ID, [newPerson(2)], 'second'), commitChange(TREE_ID, [newPerson(3)], 'third')]);
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('retries after a network failure and says so, then saves', async () => {
    let attempts = 0;
    mockApi({
      [`POST /api/trees/${TREE_ID}/changes`]: () => {
        attempts += 1;
        return attempts === 1 ? { status: 503, body: { error: { code: 'server_error', message: 'Down' } } } : { body: { version: 2, treeStatus: 'draft', inverse: [] } };
      },
    });
    const saved = commitChange(TREE_ID, [newPerson(1)], 'Added New 1');
    await vi.waitFor(() => expect(getTreeEditingState(TREE_ID).status).toBe('retrying'));
    await saved;
    expect(attempts).toBe(2);
    expect(getTreeEditingState(TREE_ID).status).toBe('saved');
  });

  it('rolls back to the server’s version and explains when the server rejects a change', async () => {
    let fetches = 0;
    const original = seedResponse().body;
    mockApi({
      [`POST /api/trees/${TREE_ID}/changes`]: () => ({ status: 409, body: { error: { code: 'tree_in_review', message: 'This tree is with your reviewer, so editing is paused.' } } }),
      [`GET /api/trees/${TREE_ID}/graph`]: () => {
        fetches += 1;
        return { body: original };
      },
    });
    // Load the tree the way the page does, with no screen observing it afterwards.
    queryClient.clear();
    await queryClient.fetchQuery(treeGraphQuery(TREE_ID));
    expect(fetches).toBe(1);
    const saving = commitChange(TREE_ID, [newPerson(1)], 'Added New 1');
    expect(graph().people.some((person) => person.firstName === 'New 1')).toBe(true);
    await expect(saving).rejects.toThrow('editing is paused');
    expect(getTreeEditingState(TREE_ID)).toMatchObject({ status: 'error', errorMessage: 'This tree is with your reviewer, so editing is paused.' });
    await vi.waitFor(() => expect(fetches).toBe(2));
    await vi.waitFor(() => expect(graph().people.some((person) => person.firstName === 'New 1')).toBe(false));
  });

  it('keeps unsaved changes on screen when the tree is refetched before they save', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = seedResponse().body;
    mockApi({
      [`POST /api/trees/${TREE_ID}/changes`]: async () => {
        await gate;
        return { body: { version: 2, treeStatus: 'draft', inverse: [] } };
      },
      [`GET /api/trees/${TREE_ID}/graph`]: () => ({ body: original }),
    });
    queryClient.clear();
    await queryClient.fetchQuery(treeGraphQuery(TREE_ID));
    const saving = commitChange(TREE_ID, [newPerson(1)], 'Added New 1');
    // Another screen (or returning to a stale tree) reloads the graph while the save is in flight.
    await queryClient.refetchQueries({ queryKey: key });
    expect(graph().people.some((person) => person.firstName === 'New 1')).toBe(true);
    release();
    await saving;
    expect(graph().people.some((person) => person.firstName === 'New 1')).toBe(true);
  });

  it('waits offline, says so, and saves when the connection returns', async () => {
    const online = vi.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(false);
    const api = mockApi({ [`POST /api/trees/${TREE_ID}/changes`]: () => ({ body: { version: 2, treeStatus: 'draft', inverse: [] } }) });
    const saving = commitChange(TREE_ID, [newPerson(1)], 'Added New 1');
    await vi.waitFor(() => expect(getTreeEditingState(TREE_ID).status).toBe('offline'));
    expect(api.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    online.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await saving;
    expect(getTreeEditingState(TREE_ID).status).toBe('saved');
    online.mockRestore();
  });

  it('undoes and redoes through the server, keeping each stack right', async () => {
    let call = 0;
    mockApi({
      [`POST /api/trees/${TREE_ID}/changes`]: () => {
        call += 1;
        const inverse: ChangeOp[] =
          call === 1 ? [{ op: 'person.delete', id: 'abababab-0000-4000-8000-000000000001' }] : call === 2 ? [newPerson(1)] : [{ op: 'person.delete', id: 'abababab-0000-4000-8000-000000000001' }];
        return { body: { version: call + 1, treeStatus: 'draft', inverse } };
      },
    });
    await commitChange(TREE_ID, [newPerson(1)], 'Added New 1');
    await undoLast(TREE_ID);
    expect(graph().people.some((person) => person.firstName === 'New 1')).toBe(false);
    expect(getTreeEditingState(TREE_ID).undo).toHaveLength(0);
    expect(getTreeEditingState(TREE_ID).redo.map((entry) => entry.label)).toEqual(['Added New 1']);
    await redoLast(TREE_ID);
    expect(graph().people.some((person) => person.firstName === 'New 1')).toBe(true);
    expect(getTreeEditingState(TREE_ID).undo).toHaveLength(1);
    expect(getTreeEditingState(TREE_ID).redo).toHaveLength(0);
    expect(undoLast('some-other-tree')).toBeNull();
  });

  it('keeps at least 20 steps of history (SPEC §5.3), capped at 100', async () => {
    mockApi({ [`POST /api/trees/${TREE_ID}/changes`]: () => ({ body: { version: 2, treeStatus: 'draft', inverse: [] } }) });
    for (let n = 1; n <= 105; n += 1) await commitChange(TREE_ID, [newPerson(n)], `Added New ${n}`);
    const { undo } = getTreeEditingState(TREE_ID);
    expect(undo.length).toBe(HISTORY_LIMIT);
    expect(undo[undo.length - 1]?.label).toBe('Added New 105');
  }, 60_000);
});
