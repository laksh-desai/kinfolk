import { describe, expect, it } from 'vitest';
import { FixtureBuilder } from '../fixtures/fixtureBuilder';
import type { Person } from '../schemas/person';
import { createKinshipResolver, resolveKinship } from './resolveKinship';

const m = { gender: 'male' as const };
const f = { gender: 'female' as const };
const x = { gender: 'unknown' as const };

/** Checks both directions: `b` is `forward` to `a`, and `a` is `backward` to `b`. */
function both(graph: ReturnType<FixtureBuilder['build']>, a: Person, b: Person, forward: string, backward: string) {
  const resolve = createKinshipResolver(graph);
  expect(resolve(a.id, b.id).label, `${b.firstName} → ${a.firstName}`).toBe(forward);
  expect(resolve(b.id, a.id).label, `${a.firstName} → ${b.firstName}`).toBe(backward);
}

describe('parents and children (§4.2 Parent · Mother · Father · Child · Son · Daughter)', () => {
  const b = new FixtureBuilder();
  const dad = b.person('Vikram', null, m);
  const mum = b.person('Nisha', null, f);
  const parent = b.person('Sam', null, x);
  const son = b.person('Ravi', null, m);
  const daughter = b.person('Asha', null, f);
  const child = b.person('Kit', null, x);
  b.family(dad, mum, [son, daughter]);
  b.family(parent, null, [child]);
  const graph = b.build();

  it('names mothers, fathers, and neutral parents, with the inverse', () => {
    both(graph, son, dad, 'Father', 'Son');
    both(graph, daughter, mum, 'Mother', 'Daughter');
    both(graph, child, parent, 'Parent', 'Child');
  });

  it('qualifies adoption on the direct link only', () => {
    const g = new FixtureBuilder();
    const adoptiveMum = g.person('Suresh', null, f);
    const grandma = g.person('Sita', null, f);
    const adopted = g.person('Maya', null, f);
    g.family(grandma, null, [adoptiveMum]);
    g.child(g.union(adoptiveMum, null), adopted, 'adopted');
    const tree = g.build();
    both(tree, adopted, adoptiveMum, 'Adoptive mother', 'Adopted daughter');
    both(tree, adopted, grandma, 'Maternal grandmother', 'Granddaughter');
  });
});

describe('siblings (§4.2 Sibling · Brother · Sister · Half-sibling · Step-sibling)', () => {
  it('names full, half, and step siblings in both directions', () => {
    const b = new FixtureBuilder();
    const dad = b.person('Vikram', null, m);
    const exWife = b.person('Priti', null, f);
    const wife = b.person('Nisha', null, f);
    const ravi = b.person('Ravi', null, m);
    const asha = b.person('Asha', null, f);
    const sib = b.person('Robin', null, x);
    const karan = b.person('Karan', null, m);
    b.family(dad, wife, [ravi, asha, sib]);
    b.family(dad, exWife, [karan], { status: 'divorced' });
    const stepDad = b.person('Tom', null, m);
    const stepSister = b.person('Lena', null, f);
    b.union(exWife, stepDad);
    b.family(stepDad, b.person('Tom’s ex', null, f), [stepSister], { status: 'divorced' });
    const graph = b.build();
    both(graph, ravi, asha, 'Sister', 'Brother');
    both(graph, ravi, sib, 'Sibling', 'Brother');
    both(graph, ravi, karan, 'Half-brother', 'Half-brother');
    both(graph, karan, stepSister, 'Step-sister', 'Step-brother');
    both(graph, karan, stepDad, 'Step-father', 'Step-son');
  });
});

describe('partners (§4.2 Partner · Spouse · Former spouse · Partner (unmarried))', () => {
  it('names current, former, separated, widowed, and unmarried partners', () => {
    const b = new FixtureBuilder();
    const ravi = b.person('Ravi', null, m);
    const priya = b.person('Priya', null, f);
    const alex = b.person('Alex', null, x);
    const ex = b.person('Dana', null, f);
    const late = b.person('Sita', null, { ...f, died: [2001] });
    const separated = b.person('Mira', null, f);
    const partner = b.person('Jo', null, m);
    b.union(ravi, priya, { type: 'marriage' });
    b.union(ravi, ex, { type: 'marriage', status: 'divorced' });
    b.union(ravi, late, { type: 'marriage', status: 'widowed' });
    b.union(ravi, separated, { type: 'marriage', status: 'separated' });
    b.union(ravi, partner, { type: 'partnership' });
    b.union(ravi, alex, { type: 'marriage' });
    const graph = b.build();
    both(graph, ravi, priya, 'Wife', 'Husband');
    both(graph, ravi, ex, 'Former wife', 'Former husband');
    both(graph, ravi, late, 'Late wife', 'Husband');
    both(graph, ravi, separated, 'Wife (separated)', 'Husband (separated)');
    both(graph, ravi, partner, 'Partner', 'Partner');
    both(graph, ravi, alex, 'Spouse', 'Husband');
  });
});

describe('step-children (§4.2 Step-child)', () => {
  it('names a partner’s child from a prior union, and describes an ex-partner’s children plainly', () => {
    const b = new FixtureBuilder();
    const ravi = b.person('Ravi', null, m);
    const priya = b.person('Priya', null, f);
    const daniel = b.person('Daniel', null, m);
    const ethan = b.person('Ethan', null, m);
    const aarav = b.person('Aarav', null, m);
    b.family(priya, daniel, [ethan], { status: 'divorced' });
    b.family(ravi, priya, [aarav]);
    const graph = b.build();
    both(graph, ravi, ethan, 'Step-son', 'Step-father');
    both(graph, daniel, aarav, 'Former wife’s son', 'Mother’s former husband');
    both(graph, ravi, daniel, 'Wife’s former husband', 'Former wife’s husband');
    both(graph, aarav, ethan, 'Half-brother', 'Half-brother');
  });

  it('names explicit step, foster, and guardian links', () => {
    const b = new FixtureBuilder();
    const carer = b.person('Rosa', null, f);
    const union = b.union(carer, null);
    const stepKid = b.person('Sol', null, m);
    const fosterKid = b.person('Leo', null, m);
    const ward = b.person('Ivy', null, f);
    b.child(union, stepKid, 'step');
    b.child(union, fosterKid, 'foster');
    b.child(union, ward, 'guardian');
    const graph = b.build();
    both(graph, carer, stepKid, 'Step-son', 'Step-mother');
    both(graph, carer, fosterKid, 'Foster son', 'Foster mother');
    both(graph, carer, ward, 'Ward', 'Guardian');
  });
});

describe('grandparents, great-grandparents, and further (§4.2)', () => {
  const b = new FixtureBuilder();
  const gg = b.person('Hari', null, m);
  const g = b.person('Mohan', null, m);
  const mumsMum = b.person('Lakshmi', null, f);
  const dad = b.person('Vikram', null, m);
  const mum = b.person('Nisha', null, f);
  const ravi = b.person('Ravi', null, m);
  const aarav = b.person('Aarav', null, m);
  const baby = b.person('Mila', null, f);
  const tiny = b.person('Otto', null, m);
  const ggggg = b.person('Old', null, m);
  const gggg = b.person('Older', null, f);
  b.family(ggggg, null, [gggg]);
  b.family(gggg, null, [gg]);
  b.family(gg, null, [g]);
  b.family(g, null, [dad]);
  b.family(mumsMum, null, [mum]);
  b.family(dad, mum, [ravi]);
  b.family(ravi, null, [aarav]);
  b.family(aarav, null, [baby]);
  b.family(baby, null, [tiny]);
  const graph = b.build();

  it('adds maternal/paternal from the parent the line runs through', () => {
    both(graph, ravi, g, 'Paternal grandfather', 'Grandson');
    both(graph, ravi, mumsMum, 'Maternal grandmother', 'Grandson');
    both(graph, ravi, gg, 'Paternal great-grandfather', 'Great-grandson');
    both(graph, ravi, gggg, 'Paternal great-great-grandmother', 'Great-great-grandson');
    both(graph, ravi, ggggg, 'Paternal 3rd great-grandfather', '3rd great-grandson');
  });

  it('counts down as well as up', () => {
    both(graph, ravi, baby, 'Granddaughter', 'Paternal grandfather');
    both(graph, ravi, tiny, 'Great-grandson', 'Maternal great-grandfather');
    both(graph, dad, tiny, 'Great-great-grandson', 'Maternal great-great-grandfather');
  });
});

describe('aunts, uncles, nieces, nephews, cousins (§4.2)', () => {
  const b = new FixtureBuilder();
  const grandpa = b.person('Mohan', null, m);
  const grandma = b.person('Sita', null, f);
  const dad = b.person('Vikram', null, m);
  const aunt = b.person('Anita', null, f);
  const uncle = b.person('Suresh', null, m);
  const sibOfParent = b.person('Kris', null, x);
  b.family(grandpa, grandma, [dad, aunt, uncle, sibOfParent]);
  const tom = b.person('Tom', null, m);
  const lukas = b.person('Lukas', null, m);
  b.family(aunt, tom, [lukas]);
  const noah = b.person('Noah', null, m);
  b.family(lukas, null, [noah]);
  const noahsKid = b.person('Iris', null, f);
  b.family(noah, null, [noahsKid]);
  const mum = b.person('Nisha', null, f);
  const ravi = b.person('Ravi', null, m);
  const asha = b.person('Asha', null, f);
  b.family(dad, mum, [ravi, asha]);
  const mia = b.person('Mia', null, f);
  const oliver = b.person('Oliver', null, m);
  const kid = b.person('Pat', null, x);
  b.family(asha, null, [mia, oliver, kid]);
  const aarav = b.person('Aarav', null, m);
  b.family(ravi, null, [aarav]);
  const graph = b.build();

  it('names aunts and uncles with side, and nieces and nephews in reverse', () => {
    both(graph, ravi, aunt, 'Paternal aunt', 'Nephew');
    both(graph, asha, uncle, 'Paternal uncle', 'Niece');
    both(graph, ravi, sibOfParent, 'Father’s sibling', 'Nephew');
    both(graph, ravi, mia, 'Niece', 'Maternal uncle');
    both(graph, ravi, oliver, 'Nephew', 'Maternal uncle');
    both(graph, ravi, kid, 'Sibling’s child', 'Maternal uncle');
  });

  it('names an aunt’s partner as an uncle by marriage', () => {
    both(graph, ravi, tom, 'Paternal uncle by marriage', 'Wife’s nephew');
  });

  it('computes cousin degree and removal', () => {
    both(graph, ravi, lukas, 'First cousin', 'First cousin');
    both(graph, ravi, noah, 'First cousin once removed', 'First cousin once removed');
    both(graph, ravi, noahsKid, 'First cousin twice removed', 'First cousin twice removed');
    both(graph, aarav, noah, 'Second cousin', 'Second cousin');
    both(graph, aarav, noahsKid, 'Second cousin once removed', 'Second cousin once removed');
    both(graph, aarav, grandpa, 'Paternal great-grandfather', 'Great-grandson');
    both(graph, aarav, aunt, 'Paternal great-aunt', 'Great-nephew');
  });

  it('marks half relationships through a shared single parent', () => {
    const h = new FixtureBuilder();
    const dadH = h.person('Vikram', null, m);
    const karan = h.person('Karan', null, m);
    const ravi2 = h.person('Ravi', null, m);
    h.family(dadH, h.person('Priti', null, f), [karan], { status: 'divorced' });
    h.family(dadH, h.person('Nisha', null, f), [ravi2]);
    const ruby = h.person('Ruby', null, f);
    h.family(karan, null, [ruby]);
    const zed = h.person('Zed', null, m);
    h.family(ravi2, null, [zed]);
    const tree = h.build();
    both(tree, ravi2, ruby, 'Half-niece', 'Paternal half-uncle');
    both(tree, zed, ruby, 'Half first cousin', 'Half first cousin');
  });
});

describe('in-laws (§4.2 Parent-in-law · Sibling-in-law · Child-in-law)', () => {
  const b = new FixtureBuilder();
  const ravi = b.person('Ravi', null, m);
  const priya = b.person('Priya', null, f);
  const mahesh = b.person('Mahesh', null, m);
  const radha = b.person('Radha', null, f);
  const divya = b.person('Divya', null, f);
  const sam = b.person('Sam', null, m);
  b.family(mahesh, radha, [priya, divya]);
  b.union(divya, sam);
  b.union(ravi, priya, { type: 'marriage' });
  const asha = b.person('Asha', null, f);
  const james = b.person('James', null, m);
  const vikram = b.person('Vikram', null, m);
  b.family(vikram, null, [ravi, asha]);
  b.union(asha, james, { type: 'marriage' });
  const aarav = b.person('Aarav', null, m);
  const zoe = b.person('Zoe', null, f);
  b.family(ravi, priya, [aarav]);
  b.union(aarav, zoe, { type: 'marriage' });
  const graph = b.build();

  it('names parents-, siblings-, and children-in-law both ways', () => {
    both(graph, ravi, mahesh, 'Father-in-law', 'Son-in-law');
    both(graph, ravi, radha, 'Mother-in-law', 'Son-in-law');
    both(graph, ravi, divya, 'Sister-in-law', 'Brother-in-law');
    both(graph, priya, asha, 'Sister-in-law', 'Sister-in-law');
    both(graph, james, ravi, 'Brother-in-law', 'Brother-in-law');
    both(graph, james, priya, 'Wife’s brother’s wife', 'Husband’s sister’s husband');
    both(graph, ravi, zoe, 'Daughter-in-law', 'Father-in-law');
    both(graph, vikram, priya, 'Daughter-in-law', 'Father-in-law');
  });

  it('describes relationships English has no single word for instead of guessing', () => {
    expect(resolveKinship(graph, ravi.id, sam.id)).toMatchObject({ label: 'Wife’s sister’s husband', category: 'in-law', path: [ravi.id, priya.id, mahesh.id, divya.id, sam.id] });
    const far = new FixtureBuilder();
    const one = far.person('One', null, m);
    const hub = far.person('Hub', null, f);
    const two = far.person('Two', null, m);
    const kidOfTwo = far.person('Kid', null, x);
    far.union(one, hub);
    far.union(hub, two, { status: 'divorced' });
    far.union(two, far.person('Other', null, f));
    far.family(two, null, [kidOfTwo]);
    expect(resolveKinship(far.build(), one.id, kidOfTwo.id)).toMatchObject({ label: 'Related — 3 steps away', category: 'distant', steps: 3 });
  });

  it('uses “partner’s” wording for unmarried couples (QUESTIONS Q15)', () => {
    const p = new FixtureBuilder();
    const ego = p.person('Jo', null, x);
    const partner = p.person('Kim', null, f);
    const partnersMum = p.person('Pat', null, f);
    p.family(partnersMum, null, [partner]);
    p.union(ego, partner, { type: 'partnership' });
    both(p.build(), ego, partnersMum, 'Partner’s mother', 'Daughter’s partner');
  });
});

describe('fallbacks and edge cases', () => {
  it('returns Self, the distance fallback, and “No known relationship”', () => {
    const b = new FixtureBuilder();
    const suresh = b.person('Suresh', null, m);
    const foster = b.person('Leo', null, m);
    const sibling = b.person('Vikram', null, m);
    const grandpa = b.person('Mohan', null, m);
    b.family(grandpa, null, [suresh, sibling]);
    b.child(b.union(suresh, null), foster, 'foster');
    const stranger = b.person('Grace', null, f);
    const graph = b.build();
    const resolve = createKinshipResolver(graph);
    expect(resolve(suresh.id, suresh.id)).toMatchObject({ label: 'Self', category: 'self', steps: 0 });
    expect(resolve(sibling.id, foster.id)).toMatchObject({ label: 'Related — 3 steps away', category: 'distant', path: [sibling.id, grandpa.id, suresh.id, foster.id] });
    expect(resolve(sibling.id, stranger.id)).toMatchObject({ label: 'No known relationship', category: 'none', path: [] });
    expect(resolve('missing', stranger.id).label).toBe('No known relationship');
  });

  it('treats unnamed placeholders like anyone else', () => {
    const b = new FixtureBuilder();
    const ravi = b.person('Ravi', null, m);
    const unnamedParent = b.placeholder();
    const unnamedSibling = b.placeholder();
    const cousin = b.person('Maya', null, f);
    b.family(b.placeholder(), null, [unnamedParent, unnamedSibling]);
    b.family(unnamedParent, null, [ravi]);
    b.family(unnamedSibling, null, [cousin]);
    both(b.build(), ravi, cousin, 'First cousin', 'First cousin');
  });

  it('gives no side when an ancestor is reached equally through both parents', () => {
    const b = new FixtureBuilder();
    const ancestor = b.person('Root', null, f);
    const a = b.person('A', null, m);
    const c = b.person('C', null, f);
    b.family(ancestor, null, [a, c]);
    const dad = b.person('Dad', null, m);
    const mum = b.person('Mum', null, f);
    b.family(a, null, [dad]);
    b.family(c, null, [mum]);
    const ego = b.person('Ego', null, m);
    b.family(dad, mum, [ego]);
    expect(resolveKinship(b.build(), ego.id, ancestor.id).label).toBe('Great-grandmother');
  });
});
