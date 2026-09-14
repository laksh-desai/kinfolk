import { buildSeedTree } from '@kinfolk/shared/fixtures/seedTree';
import { indexGraph } from '@kinfolk/shared/graph/graphIndex';
import { computeLayout } from '@kinfolk/shared/layout/computeLayout';
import { describe, expect, it } from 'vitest';
import { outlineTree } from './outlineTree';

describe('outlineTree (SPEC §5.3 list view)', () => {
  const { graph, people, unions } = buildSeedTree();
  const index = indexGraph(graph);
  const layout = computeLayout(graph, { cardHeight: 112 });
  const outline = outlineTree(index, layout);
  const family = (unionId: string) => outline.flatMap((generation) => generation.families).find((candidate) => candidate.unionId === unionId);

  it('lists every person exactly once, generation by generation', () => {
    const listed = outline.flatMap((generation) => generation.families.flatMap((entry) => entry.memberIds));
    expect(listed).toHaveLength(graph.people.length);
    expect(new Set(listed).size).toBe(graph.people.length);
    expect(outline.map((generation) => generation.number)).toEqual(outline.map((_, position) => position + 1));
    const generationOf = (id: string) => outline.findIndex((generation) => generation.families.some((entry) => entry.memberIds.includes(id)));
    expect(generationOf(people.hari.id)).toBeLessThan(generationOf(people.mohan.id));
    expect(generationOf(people.mohan.id)).toBeLessThan(generationOf(people.vikram.id));
    expect(generationOf(people.vikram.id)).toBeLessThan(generationOf(people.ravi.id));
  });

  it('groups by family unit with their children, and mentions a remarried partner in each family', () => {
    expect(family(unions.mohanSita.id)).toMatchObject({ memberIds: expect.arrayContaining([people.mohan.id, people.sita.id]) });
    expect(family(unions.mohanSita.id)?.childIds.sort()).toEqual([people.vikram.id, people.anita.id, people.suresh.id].sort());
    const first = family(unions.vikramPriti.id);
    const second = family(unions.vikramNisha.id);
    const vikramFamilies = [first, second].filter((entry) => entry?.memberIds.includes(people.vikram.id));
    expect(vikramFamilies).toHaveLength(1);
    expect([first, second].some((entry) => entry?.alsoIn.includes(people.vikram.id))).toBe(true);
    expect(family(unions.sureshAlone.id)).toEqual({ unionId: unions.sureshAlone.id, memberIds: [people.suresh.id], alsoIn: [], childIds: [people.maya.id, people.leo.id] });
  });

  it('lists people with no partnership on their own, and leaves out a collapsed branch like the canvas', () => {
    const samuel = outline.flatMap((generation) => generation.families).find((entry) => entry.memberIds.includes(people.samuel.id));
    expect(samuel).toEqual({ unionId: null, memberIds: [people.samuel.id], alsoIn: [], childIds: [] });
    const collapsed = outlineTree(index, computeLayout(graph, { cardHeight: 112, collapsed: [people.vikram.id] }));
    const listed = collapsed.flatMap((generation) => generation.families.flatMap((entry) => entry.memberIds));
    expect(listed).not.toContain(people.ravi.id);
    expect(listed).toContain(people.vikram.id);
  });
});
