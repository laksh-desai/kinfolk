import { graphToOps } from '@kinfolk/shared/fixtures/fixtureBuilder';
import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import type { KeyEvent } from '@kinfolk/shared/events/keyEvents';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, signUpUser, type TestContext } from './testApp';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

describe('key events (SPEC §5.8, §6.4)', () => {
  it('populates from the caller’s own and shared trees, and never from other people’s', async () => {
    const owner = ctx.client();
    await signUpUser(owner);
    const tree = (await owner.post('/api/trees', { name: 'Sharma family' })).json().tree;
    const seed = buildSeedTree({ namespace: 0x8100 });
    expect((await owner.post(`/api/trees/${tree.id}/changes`, { ops: graphToOps(seed.graph) })).statusCode).toBe(200);

    const body = (await owner.get('/api/events')).json() as { events: KeyEvent[]; needDates: Array<{ treeName: string; count: number }> };
    expect(body.events.length).toBeGreaterThan(20);
    expect(body.events.every((event) => event.treeId === tree.id && event.treeName === 'Sharma family')).toBe(true);
    expect(body.events.map((event) => event.daysUntil)).toEqual([...body.events.map((event) => event.daysUntil)].sort((a, b) => a - b));
    expect(body.events.some((event) => event.type === 'anniversary')).toBe(true);
    expect(body.events.find((event) => event.id === `birthday:${seed.people.ravi.id}`)).toMatchObject({ month: 4, day: 12 });
    // Mohan is deceased, so his birthday is not a reminder.
    expect(body.events.some((event) => event.id === `birthday:${seed.people.mohan.id}`)).toBe(false);
    expect(body.needDates).toEqual([expect.objectContaining({ treeId: tree.id, treeName: 'Sharma family' })]);

    // Someone with no trees sees an empty list, not other people's events.
    const stranger = ctx.client();
    await signUpUser(stranger);
    expect((await stranger.get('/api/events')).json()).toEqual({ events: [], needDates: [] });

    // A viewer on the tree sees its events too.
    const viewer = ctx.client();
    const { email } = await signUpUser(viewer);
    const accessId = (await owner.post(`/api/trees/${tree.id}/access`, { email, role: 'viewer' })).json().access.id;
    await viewer.post(`/api/me/access-invites/${accessId}/accept`, {});
    expect((await viewer.get('/api/events')).json().events.length).toBe(body.events.length);
  });
});
