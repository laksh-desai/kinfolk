import { keyEvents, undatablePeople, type EventTree, type KeyEvent } from '@kinfolk/shared/events/keyEvents';
import { toCalendarDay } from '@kinfolk/shared/dates/partialDate';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../lib/deps';
import { personFromRow, unionFromRow } from '../../lib/graphRows';
import { requireAuth } from '../auth/authenticate';

export interface KeyEventsDto {
  events: KeyEvent[];
  /** People with a birth year but no day and month, per tree, so the screen can explain the gap. */
  needDates: Array<{ treeId: string; treeName: string; count: number }>;
}

/**
 * Key events across every tree the caller can open (SPEC §5.8). Derived from the same dates the
 * tree holds — nothing is stored — so the screen can never be empty while the data is there.
 */
export async function eventRoutes(app: FastifyInstance, opts: { deps: AppDeps }) {
  const { deps } = opts;

  app.get('/api/events', async (request): Promise<KeyEventsDto> => {
    const { user } = requireAuth(request);
    const [owned, shared] = await Promise.all([
      deps.prisma.tree.findMany({ where: { ownerId: user.id }, select: { id: true, name: true } }),
      deps.prisma.access.findMany({ where: { userId: user.id, status: 'active' }, select: { tree: { select: { id: true, name: true, ownerId: true } } } }),
    ]);
    const trees = [...owned, ...shared.filter((access) => access.tree.ownerId !== user.id).map((access) => ({ id: access.tree.id, name: access.tree.name }))];
    if (trees.length === 0) return { events: [], needDates: [] };

    const treeIds = trees.map((tree) => tree.id);
    const [people, unions] = await Promise.all([
      deps.prisma.person.findMany({ where: { treeId: { in: treeIds } } }),
      deps.prisma.union.findMany({ where: { treeId: { in: treeIds } } }),
    ]);

    const eventTrees: EventTree[] = trees.map((tree) => ({
      treeId: tree.id,
      treeName: tree.name,
      people: people.filter((person) => person.treeId === tree.id).map(personFromRow),
      unions: unions.filter((union) => union.treeId === tree.id).map(unionFromRow),
    }));
    const today = toCalendarDay(deps.now());
    return {
      events: keyEvents(eventTrees, today),
      needDates: eventTrees
        .map((tree) => ({ treeId: tree.treeId, treeName: tree.treeName, count: undatablePeople(tree).length }))
        .filter((entry) => entry.count > 0),
    };
  });
}
