import type { TreeGraph } from '../schemas/graph';
import type { Person } from '../schemas/person';
import { FixtureBuilder } from './fixtureBuilder';

/** Small deterministic PRNG (mulberry32) so the "random" family is identical on every run. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Aria', 'Ben', 'Chloe', 'Dmitri', 'Eli', 'Farah', 'Gus', 'Hana', 'Ivan', 'Jaya', 'Kai', 'Lena', 'Milo', 'Nia', 'Omar', 'Pia', 'Quinn', 'Rosa', 'Sol', 'Tara', 'Uma', 'Viktor', 'Wren', 'Yusuf', 'Zoe'];
const LAST = ['Adams', 'Baker', 'Cho', 'Diaz', 'Evans', 'Fischer', 'Gupta', 'Haddad', 'Ito', 'Jensen', 'Kowalski', 'Lopez', 'Moreau', 'Novak', 'Okoro', 'Park', 'Quist', 'Rossi', 'Silva', 'Tanaka'];

export interface LargeTreeOptions {
  people?: number;
  generations?: number;
  seed?: number;
}

/**
 * A realistic large family for performance work (SPEC §4.5.19): six generations descending from
 * one founding couple. Most descendants marry someone from outside (a new in-law root), with
 * occasional remarriage and single parents, until the target head count is reached.
 */
export function buildLargeTree({ people = 500, generations = 6, seed = 42 }: LargeTreeOptions = {}): TreeGraph {
  const random = mulberry32(seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  const b = new FixtureBuilder(0x1a26e);
  let count = 0;

  const newPerson = (lastName: string, birthYear: number, gender: 'male' | 'female'): Person => {
    count += 1;
    const deceased = birthYear < 1940 || (birthYear < 1960 && random() < 0.4);
    return b.person(pick(FIRST), lastName, {
      gender,
      born: random() < 0.15 ? [birthYear] : [birthYear, 1 + Math.floor(random() * 12), 1 + Math.floor(random() * 28)],
      ...(deceased ? { died: [birthYear + 60 + Math.floor(random() * 30)] as [number] } : {}),
    });
  };

  const founderA = newPerson(pick(LAST), 1900, 'male');
  const founderB = newPerson(pick(LAST), 1903, 'female');
  let current: Array<{ person: Person; year: number }> = [];
  const firstUnion = b.union(founderA, founderB, { type: 'marriage', status: 'widowed' });
  const firstChildren = 4;
  for (let i = 0; i < firstChildren; i += 1) {
    const child = newPerson(founderA.lastName ?? 'Adams', 1925 + i * 2, random() < 0.5 ? 'male' : 'female');
    b.child(firstUnion, child);
    current.push({ person: child, year: 1925 + i * 2 });
  }

  let parentsOfLast = current;
  for (let generation = 2; generation < generations && count < people; generation += 1) {
    const next: Array<{ person: Person; year: number }> = [];
    parentsOfLast = current;
    for (const { person, year } of current) {
      if (count >= people) break;
      const partnerGender = person.gender === 'male' ? 'female' : 'male';
      const roll = random();
      const unionsToMake = roll < 0.12 ? 2 : roll < 0.9 ? 1 : 0;
      for (let u = 0; u < unionsToMake && count < people; u += 1) {
        const partner = random() < 0.08 ? null : newPerson(pick(LAST), year + Math.floor(random() * 6) - 3, partnerGender);
        const union = b.union(person, partner, {
          type: partner ? 'marriage' : 'unknown',
          status: unionsToMake === 2 && u === 0 ? 'divorced' : 'current',
        });
        const kids = 1 + Math.floor(random() * 3);
        for (let k = 0; k < kids && count < people; k += 1) {
          const birthYear = year + 24 + u * 6 + k * 2;
          const child = newPerson(person.lastName ?? 'Adams', birthYear, random() < 0.5 ? 'male' : 'female');
          b.child(union, child, random() < 0.05 ? 'adopted' : 'biological');
          next.push({ person: child, year: birthYear });
        }
      }
    }
    current = next;
  }

  // Top up any shortfall with more children for the second-to-last generation, so the tree
  // never grows past the requested number of generations.
  const topUpParents = parentsOfLast.length > 0 ? parentsOfLast : current;
  const topUpUnions = new Map<string, ReturnType<typeof b.union>>();
  let cursor = 0;
  while (count < people && topUpParents.length > 0) {
    const { person, year } = topUpParents[cursor % topUpParents.length] as { person: Person; year: number };
    cursor += 1;
    let union = topUpUnions.get(person.id);
    if (!union) {
      union = b.union(person, null);
      topUpUnions.set(person.id, union);
    }
    b.child(union, newPerson(person.lastName ?? 'Adams', year + 25 + (cursor % 10), cursor % 2 === 0 ? 'female' : 'male'));
  }

  return b.build();
}
