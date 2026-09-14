import { resolveKinship } from '@kinfolk/shared/kinship/resolveKinship';
import { planAddDetached, planAddRelative, type AddRelativeRequest, type RelationKey } from '@kinfolk/shared/relatives/planAddRelative';
import { planUpdateUnion } from '@kinfolk/shared/relatives/planRelationshipEdits';
import { blankPerson } from '@kinfolk/shared/relatives/planState';
import type { ChangeOp } from '@kinfolk/shared/schemas/changeSet';
import type { TreeGraph } from '@kinfolk/shared/schemas/graph';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, signUpUser, type TestClient, type TestContext } from './testApp';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

/**
 * The M6 journey (SPEC §12) driven through the same planners the UI uses, against the real
 * endpoint and Postgres: every change set the add-relative screens produce must be accepted.
 */
describe('building a family outward through the API', () => {
  it('accepts every add-relative change set, a correction, and undo/redo', async () => {
    const client: TestClient = ctx.client();
    await signUpUser(client);
    const tree = (await client.post('/api/trees', { name: 'Journey' })).json().tree as { id: string };
    const graph = async () => (await client.get(`/api/trees/${tree.id}/graph`)).json().graph as TreeGraph;
    const send = async (ops: ChangeOp[]) => {
      const response = await client.post(`/api/trees/${tree.id}/changes`, { ops, description: 'journey' });
      expect(response.statusCode, response.body).toBe(200);
      return response.json() as { inverse: ChangeOp[] };
    };
    const ids = new Map<string, string>();
    const add = async (anchor: string, relation: RelationKey, name: string, gender: 'male' | 'female', extra: Partial<AddRelativeRequest> = {}) => {
      const person = blankPerson(randomUUID(), { firstName: name, gender });
      const plan = planAddRelative(await graph(), { anchorId: ids.get(anchor) as string, relation, person, ...extra }, { newId: randomUUID });
      await send(plan.ops);
      ids.set(name, person.id);
    };
    const label = async (name: string) => resolveKinship(await graph(), ids.get('Ravi') as string, ids.get(name) as string).label;

    const ravi = blankPerson(randomUUID(), { firstName: 'Ravi', gender: 'male' });
    await send(planAddDetached(await graph(), ravi, { newId: randomUUID }).ops);
    ids.set('Ravi', ravi.id);

    await add('Ravi', 'grandparent', 'Hari', 'male');
    await add('Ravi', 'great-grandparent', 'Kamal', 'male');
    await add('Ravi', 'aunt-uncle', 'Anita', 'female');
    await add('Ravi', 'aunt-uncle', 'Suresh', 'male');
    await add('Ravi', 'cousin', 'Lukas', 'male');
    await add('Anita', 'cousin', 'Meera', 'female');
    await add('Meera', 'child', 'Arjun', 'male');
    await add('Ravi', 'niece-nephew', 'Mia', 'female');
    await add('Ravi', 'niece-nephew', 'Oliver', 'male');
    await add('Ravi', 'half-sibling', 'Karan', 'male');
    await add('Ravi', 'spouse', 'Priya', 'female');
    await add('Ravi', 'step-child', 'Ethan', 'male');
    await add('Ravi', 'parent-in-law', 'Radha', 'female');
    await add('Ravi', 'sibling-in-law', 'Divya', 'female');

    expect(await label('Hari')).toBe('Grandfather');
    expect(await label('Kamal')).toBe('Great-grandfather');
    expect(await label('Arjun')).toBe('Second cousin');
    expect(await label('Ethan')).toBe('Step-son');
    expect(await label('Divya')).toBe('Sister-in-law');

    const marriage = (await graph()).unions.find((union) => union.partnerBId === ids.get('Priya') || union.partnerAId === ids.get('Priya'));
    const { inverse } = await send(planUpdateUnion(marriage?.id as string, { status: 'divorced' }));
    expect(await label('Priya')).toBe('Former wife');
    const redo = await send(inverse);
    expect(await label('Priya')).toBe('Wife');
    await send(redo.inverse);
    expect(await label('Priya')).toBe('Former wife');
  }, 120_000);
});
