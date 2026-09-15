import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import { screen, waitFor, within } from '@testing-library/react';
import { applyChangeSet } from '@kinfolk/shared/graph/applyChangeSet';
import type { ChangeOp } from '@kinfolk/shared/schemas/changeSet';
import type { TreeGraph } from '@kinfolk/shared/schemas/graph';
import type { TreeDto } from '@kinfolk/shared/schemas/tree';
import { resetChangeQueues } from '../features/tree/editing/changeQueue';
import { useEditingStore } from '../features/tree/editing/editingStore';
import { usePersonDialogs } from '../features/tree/people/personDialogStore';
import { useToasts } from '../lib/toast';
import { useAnnouncer } from '../lib/announcer';
import { mockApi, testUser } from './mockApi';
import { TREE_ID, treeDto } from './treeFixtures';

export interface ChangeCall {
  ops: ChangeOp[];
  description: string;
}

/**
 * A stand-in for the tree API that really applies each change set with the shared
 * applyChangeSet, so the inverse ops, undo, and later refetches behave like the server's.
 */
export function mockTreeServer(options: { graph?: TreeGraph; tree?: Partial<TreeDto> } = {}) {
  resetChangeQueues();
  useEditingStore.getState().reset(TREE_ID);
  usePersonDialogs.getState().close();
  useToasts.setState({ toasts: [] });
  useAnnouncer.setState({ polite: '', assertive: '' });
  const seed = buildSeedTree();
  let graph = options.graph ?? seed.graph;
  let version = 1;
  const changes: ChangeCall[] = [];
  const api = mockApi({
    'GET /api/auth/me': () => ({ body: { user: testUser } }),
    'GET /api/me/inbox': () => ({ body: { accessInvites: [], linkRequests: [], invitations: [], changeRequests: [] } }),
    [`GET /api/trees/${TREE_ID}/invitations`]: () => ({ body: { invitations: [] } }),
    [`GET /api/trees/${TREE_ID}`]: () => ({ body: { tree: treeDto({ focusPersonId: graph.focusPersonId, version, ...options.tree }) } }),
    [`GET /api/trees/${TREE_ID}/graph`]: () => ({ body: { tree: treeDto({ focusPersonId: graph.focusPersonId, version, ...options.tree }), graph } }),
    [`POST /api/trees/${TREE_ID}/changes`]: (request) => {
      const body = request.body as ChangeCall;
      changes.push(body);
      try {
        const result = applyChangeSet(graph, body.ops, { now: new Date().toISOString() });
        graph = result.graph;
        version += 1;
        return { body: { version, treeStatus: 'draft', inverse: result.inverse } };
      } catch (error) {
        return { status: 422, body: { error: { code: 'invalid_change', message: error instanceof Error ? error.message : 'Invalid' } } };
      }
    },
  });
  return { api, seed, changes, graph: () => graph };
}

/** A visible toast whose text matches (Radix renders each as a list item in the Notifications region). */
export async function findToast(text: RegExp): Promise<HTMLElement> {
  let found: HTMLElement | undefined;
  await waitFor(() => {
    const items = within(screen.getByRole('region', { name: /^Notifications/ })).queryAllByRole('listitem');
    found = items.find((element) => text.test(element.textContent ?? ''));
    if (!found) throw new Error(`No toast matching ${text}. Toasts: ${items.map((element) => element.textContent).join(' | ')}`);
  });
  return found as HTMLElement;
}
