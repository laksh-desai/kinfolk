import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import { NEW_PERSON } from '@kinfolk/shared/relatives/planAddRelative';
import { describe, expect, it } from 'vitest';
import { resolveConnection } from './resolveConnection';

describe('resolveConnection', () => {
  const { graph, people } = buildSeedTree();

  it('answers every question with its first option until the user chooses', () => {
    const resolved = resolveConnection(graph, people.ravi.id, 'cousin', {});
    expect(resolved.steps.map((step) => step.key)).toEqual(['parentId', 'auntUncleId']);
    expect(resolved.via.parentId).toBe(resolved.steps[0]?.options[0]?.id);
    expect(resolved.via.auntUncleId).toBe(resolved.steps[1]?.options[0]?.id);
  });

  it('re-asks the follow-up question when an earlier answer changes', () => {
    const nishaSide = resolveConnection(graph, people.ravi.id, 'cousin', { parentId: people.nisha.id });
    expect(nishaSide.steps[1]?.options.map((option) => option.label)).toEqual(['Kiran Rao']);
    // An aunt chosen on Vikram's side is not valid on Nisha's; it falls back to the first valid one.
    const stale = resolveConnection(graph, people.ravi.id, 'cousin', { parentId: people.nisha.id, auntUncleId: people.anita.id });
    expect(stale.via.auntUncleId).toBe(people.kiran.id);
  });

  it('drops follow-ups when the user picks someone not in the tree yet', () => {
    const resolved = resolveConnection(graph, people.ravi.id, 'cousin', { parentId: NEW_PERSON, auntUncleId: people.anita.id });
    expect(resolved.via).toEqual({ parentId: NEW_PERSON });
    expect(resolved.steps.map((step) => step.key)).toEqual(['parentId']);
  });

  it('asks only the sibling-in-law question for the chosen direction', () => {
    expect(resolveConnection(graph, people.ravi.id, 'sibling-in-law', {}, 'partner').steps.map((step) => step.key)).toEqual(['partnerId']);
    expect(resolveConnection(graph, people.ravi.id, 'sibling-in-law', {}, 'sibling').steps.map((step) => step.key)).toEqual(['siblingId']);
  });
});
