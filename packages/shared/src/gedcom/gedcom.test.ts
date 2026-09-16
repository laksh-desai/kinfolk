import { describe, expect, it } from 'vitest';
import { buildSeedTree } from '../fixtures/seedTree';
import { indexGraph } from '../graph/graphIndex';
import { validateGraph } from '../graph/applyChangeSet';
import { resolveKinship } from '../kinship/resolveKinship';
import type { TreeGraph } from '../schemas/graph';
import { formatGedcomDate, parseGedcom, parseGedcomDate, writeGedcom } from './gedcom';

function idFactory(prefix = 'eeeeeeee') {
  let n = 0;
  return () => `${prefix}-0000-4000-8000-${(++n).toString().padStart(12, '0')}`;
}

/** A person's place in the family, without ids: what a round trip must preserve. */
function shape(graph: TreeGraph) {
  const index = indexGraph(graph);
  const name = (id: string) => {
    const person = index.person(id);
    return person ? `${person.firstName} ${person.lastName ?? ''}`.trim() : '?';
  };
  return graph.people
    .map((person) => ({
      name: name(person.id),
      gender: person.gender,
      lifeStatus: person.lifeStatus,
      birth: person.birthDate,
      death: person.deathDate,
      parents: index.parentsOf(person.id).map((link) => `${name(link.parentId)}:${link.edge.kind}`).sort(),
      partners: index.partnersOf(person.id).map((link) => `${link.partnerId ? name(link.partnerId) : 'alone'}:${link.union.type}:${link.union.status}`).sort(),
      children: index.childrenOf(person.id).map((link) => name(link.childId)).sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

describe('GEDCOM (SPEC §5.3)', () => {
  const { graph, people } = buildSeedTree();

  it('round-trips the whole seed tree: same people, dates, families, and kinds', () => {
    const text = writeGedcom(graph, { treeName: 'Sharma family', now: new Date('2026-09-15T00:00:00Z') });
    const imported = parseGedcom(text, { newId: idFactory(), now: '2026-09-15T00:00:00.000Z' });
    expect(imported.problems).toEqual([]);
    expect(imported.counts).toEqual({ people: graph.people.length, families: graph.unions.length, parentChildren: graph.parentChildren.length });
    expect(validateGraph(imported.graph)).toEqual([]);
    expect(shape(imported.graph)).toEqual(shape(graph));

    // Relationships survive: the second cousin once removed is still exactly that.
    const raviAgain = imported.graph.people.find((person) => person.firstName === 'Ravi');
    const ishaanAgain = imported.graph.people.find((person) => person.firstName === 'Ishaan');
    expect(raviAgain && ishaanAgain && resolveKinship(imported.graph, raviAgain.id, ishaanAgain.id).label).toBe(resolveKinship(graph, people.ravi.id, people.ishaan.id).label);
  });

  it('writes standard records, and never contact details', () => {
    const text = writeGedcom(graph, { treeName: 'Sharma family' });
    expect(text.startsWith('0 HEAD')).toBe(true);
    expect(text.trimEnd().endsWith('0 TRLR')).toBe(true);
    expect(text).toContain('2 VERS 5.5.1');
    expect(text).toContain('1 NAME Ravi /Sharma/');
    expect(text).toContain('2 DATE 12 APR 1988');
    expect(text).toContain('1 SEX M');
    expect(text).toContain('2 PEDI adopted');
    for (const secret of ['ravi.sharma@example.com', '+1 415 555 0142', 'Alder Street', 'overallObjective']) expect(text).not.toContain(secret);
  });

  it('reads a file from another tool, keeping what it can and saying what it can’t', () => {
    const foreign = [
      '0 HEAD',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME John /Smith/ Jr',
      '1 SEX M',
      '1 BIRT',
      '2 DATE ABT 1950',
      '0 @I2@ INDI',
      '1 NAME Mary "Molly" /Smith/',
      '1 SEX F',
      '1 DEAT',
      '2 DATE BET 1990 AND 1995',
      '0 @I3@ INDI',
      '1 NAME Anna /Smith/',
      '1 FAMC @F1@',
      '2 PEDI adopted',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 WIFE @I2@',
      '1 CHIL @I3@',
      '1 MARR',
      '2 DATE 3 JUN 1972',
      '0 @X1@ _CUSTOM',
      '0 TRLR',
    ].join('\n');
    const imported = parseGedcom(foreign, { newId: idFactory('ffffffff') });
    expect(imported.counts).toEqual({ people: 3, families: 1, parentChildren: 1 });
    const john = imported.graph.people[0];
    expect(john).toMatchObject({ firstName: 'John', lastName: 'Smith', suffix: 'Jr', gender: 'male', birthDate: { year: 1950, month: null, day: null, approximate: true } });
    expect(imported.graph.people[1]).toMatchObject({ firstName: 'Mary', nickname: 'Molly', lifeStatus: 'deceased', deathDate: null });
    expect(imported.graph.parentChildren[0]?.kind).toBe('adopted');
    expect(imported.graph.unions[0]).toMatchObject({ type: 'marriage', status: 'current', startDate: { year: 1972, month: 6, day: 3 } });
    expect(imported.problems).toEqual([
      'Records of type _CUSTOM aren’t supported and were left out.',
      'Couldn’t read the death date “BET 1990 AND 1995” for Mary; the rest of their details were kept.',
    ]);
    expect(validateGraph(imported.graph)).toEqual([]);
  });

  it('reads and writes the date forms this product supports', () => {
    expect(parseGedcomDate('12 APR 1988')).toEqual({ year: 1988, month: 4, day: 12, approximate: false });
    expect(parseGedcomDate('APR 1988')).toEqual({ year: 1988, month: 4, day: null, approximate: false });
    expect(parseGedcomDate('1988')).toEqual({ year: 1988, month: null, day: null, approximate: false });
    expect(parseGedcomDate('ABT 1910')).toEqual({ year: 1910, month: null, day: null, approximate: true });
    expect(parseGedcomDate('BET 1900 AND 1910')).toBeNull();
    expect(parseGedcomDate('nonsense')).toBeNull();
    expect(formatGedcomDate({ year: 1988, month: 4, day: 12, approximate: false })).toBe('12 APR 1988');
    expect(formatGedcomDate({ year: 1910, month: null, day: null, approximate: true })).toBe('ABT 1910');
  });
});
