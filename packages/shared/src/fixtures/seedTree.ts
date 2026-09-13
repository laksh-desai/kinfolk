import type { TreeGraph } from '../schemas/graph';
import type { Person } from '../schemas/person';
import type { Union } from '../schemas/union';
import { FixtureBuilder } from './fixtureBuilder';

/**
 * The seed family: about 60 people covering every structure in SPEC §4.5 (except the
 * 500-person case, which lives in largeTree.ts). This is the fixture for layout, kinship, and
 * the database seed, so its shape is load-bearing — change it and update the curated
 * expectations in the kinship tests.
 *
 * Focus person: Ravi Sharma (generation 3). Generations below are relative to the Sharma root.
 *
 *   G0  Hari ═ Kamala (both deceased)             Gopal ═ Lakshmi Rao (in-law root)
 *   G1  Mohan (†) ═ Sita     Leela (†) ═ Arun Iyer (†)          Nisha, Kiran
 *   G2  Vikram ═╌ Priti (divorced)   Vikram ═ Nisha   Anita ═ Tom   Suresh (single parent)   Meera ═ Raj
 *   G3  Karan (half-bro)   Ravi ═ Priya, Asha, twins Dev & Diya   Lukas, Emma   Maya (adopted), Leo (foster)   Arjun
 *   G4  Ruby   Aarav, Anika, Ethan (step)   Mia, Oliver   Noah   Ishaan   Ada, Kofi
 */
/** `namespace` changes every id, so the same family can be stored in several trees of one database. */
export function buildSeedTree({ namespace = 0x5eed }: { namespace?: number } = {}) {
  const b = new FixtureBuilder(namespace);
  const m = { gender: 'male' as const };
  const f = { gender: 'female' as const };

  // --- Focus person is created first so they are the tree head (QUESTIONS Q29) ---------
  const ravi = b.person('Ravi', 'Sharma', { ...m, born: [1988, 4, 12], profession: 'Architect', email: 'ravi.sharma@example.com', phone: '+1 415 555 0142', address: { formatted: '12 Alder Street, Portland, OR 97205, USA', street: '12 Alder Street', city: 'Portland', state: 'OR', postalCode: '97205', country: 'USA', lat: null, lng: null } });

  // --- G0: great-grandparents, both deceased (§4.5.13, §4.5.16) -------------------------
  const hari = b.person('Hari', 'Sharma', { ...m, born: [1910], died: [1978, 2, 3], approximate: true });
  const kamala = b.person('Kamala', 'Sharma', { ...f, born: [1915, 8, 21], died: [1990, 11, 30] });

  // --- G1 ---------------------------------------------------------------------------------
  const mohan = b.person('Mohan', 'Sharma', { ...m, born: [1935, 1, 9], died: [2005, 6, 17] });
  const leela = b.person('Leela', 'Iyer', { ...f, born: [1938, 3, 2], died: [2015], maidenName: 'Sharma' });
  const sita = b.person('Sita', 'Sharma', { ...f, born: [1940, 7, 7] });
  const arun = b.person('Arun', 'Iyer', { ...m, born: [1934], died: [2001], approximate: true });
  b.family(hari, kamala, [mohan, leela], { type: 'marriage', status: 'widowed', start: [1933] });

  // --- G2 ---------------------------------------------------------------------------------
  const vikram = b.person('Vikram', 'Sharma', { ...m, born: [1958, 10, 1] });
  const anita = b.person('Anita', 'Becker', { ...f, born: [1961, 5, 14], maidenName: 'Sharma' });
  const suresh = b.person('Suresh', 'Sharma', { ...m, born: [1964, 12, 25] });
  const mohanSita = b.family(mohan, sita, [vikram, anita, suresh], { type: 'marriage', status: 'widowed', start: [1956, 2, 11] });

  const meera = b.person('Meera', 'Pillai', { ...f, born: [1962, 9, 9], maidenName: 'Iyer' });
  b.family(leela, arun, [meera], { type: 'marriage', status: 'widowed', start: [1959] });

  // Remarriage (§4.5.5): Vikram's divorced first marriage, then his current one.
  const priti = b.person('Priti', 'Kapoor', { ...f, born: [1960] });
  const karan = b.person('Karan', 'Sharma', { ...m, born: [1982, 3, 3] });
  const vikramPriti = b.family(vikram, priti, [karan], { type: 'marriage', status: 'divorced', start: [1980, 5, 1], end: [1985] });

  // In-law branch (§4.5.14): Nisha married in; her parents and brother are a separate root.
  const gopal = b.person('Gopal', 'Rao', { ...m, born: [1932], died: [2011, 1, 15] });
  const lakshmi = b.person('Lakshmi', 'Rao', { ...f, born: [1936, 4, 4] });
  const nisha = b.person('Nisha', 'Sharma', { ...f, born: [1963, 6, 30], maidenName: 'Rao' });
  const kiran = b.person('Kiran', 'Rao', { ...m, born: [1966, 2, 20] });
  b.family(gopal, lakshmi, [nisha, kiran], { type: 'marriage', status: 'widowed', start: [1960] });
  const fatima = b.person('Fatima', 'Rao', { ...f, born: [1967, 8, 8] });
  const zara = b.person('Zara', 'Rao', { ...f, born: [1992, 10, 10] });
  const rohan = b.person('Rohan', 'Rao', { ...m, born: [1995, 1, 1] });
  b.family(kiran, fatima, [zara, rohan], { type: 'marriage', start: [1990, 9, 15] });

  // Vikram ═ Nisha, with Ravi, Asha, and twins Dev & Diya (§4.5.15); Karan is their half-brother (§4.5.6).
  const asha = b.person('Asha', 'Sharma', { ...f, born: [1991, 8, 19] });
  const dev = b.person('Dev', 'Sharma', { ...m, born: [1996, 3, 14] });
  const diya = b.person('Diya', 'Rossi', { ...f, born: [1996, 3, 14], maidenName: 'Sharma' });
  const vikramNisha = b.union(vikram, nisha, { type: 'marriage', status: 'current', start: [1986, 11, 22] });
  for (const child of [ravi, asha, dev, diya]) b.child(vikramNisha, child);

  // Aunt Anita ═ Tom (§4.5.9); first cousins Lukas and Emma (§4.5.10).
  const tom = b.person('Tom', 'Becker', { ...m, born: [1959, 12, 2] });
  const lukas = b.person('Lukas', 'Becker', { ...m, born: [1986, 7, 4] });
  const emma = b.person('Emma', 'Becker', { ...f, born: [1989, 2, 28] });
  b.family(anita, tom, [lukas, emma], { type: 'marriage', start: [1985, 4, 20] });
  const sofia = b.person('Sofia', 'Martinez', { ...f, born: [1988] });
  const noah = b.person('Noah', 'Becker', { ...m, born: [2015, 5, 5] });
  b.family(lukas, sofia, [noah], { type: 'partnership', start: [2012] });
  // A couple with no children (§4.5.2).
  const hannah = b.person('Hannah', 'Becker', { ...f, born: [1990, 11, 11] });
  b.union(emma, hannah, { type: 'marriage', start: [2019, 6, 1] });

  // Uncle Suresh, a single parent (§4.5.4) with an adopted and a foster child (§4.5.8).
  const maya = b.person('Maya', 'Sharma', { ...f, born: [2000, 10, 2] });
  const leo = b.person('Leo', 'Okonkwo', { ...m, born: [2008] });
  const sureshAlone = b.union(suresh, null);
  b.child(sureshAlone, maya, 'adopted');
  b.child(sureshAlone, leo, 'foster');

  // Second cousins and once-removed, four generations deep on a collateral line (§4.5.11).
  const raj = b.person('Raj', 'Pillai', { ...m, born: [1960] });
  const arjun = b.person('Arjun', 'Pillai', { ...m, born: [1990, 12, 12] });
  b.family(meera, raj, [arjun], { type: 'marriage', start: [1988] });
  const kavya = b.person('Kavya', 'Pillai', { ...f, born: [1992] });
  const ishaan = b.person('Ishaan', 'Pillai', { ...m, born: [2018, 3, 30] });
  b.family(arjun, kavya, [ishaan], { type: 'marriage', start: [2016] });

  // --- G3: Ravi's own family ---------------------------------------------------------------
  // Priya married in with her own parents and sister (a second in-law branch), and a son from
  // her divorced first marriage who is Ravi's step-son (§4.5.7).
  const mahesh = b.person('Mahesh', 'Nair', { ...m, born: [1955] });
  const radha = b.person('Radha', 'Nair', { ...f, born: [1958, 1, 26] });
  const priya = b.person('Priya', 'Sharma', { ...f, born: [1987, 9, 3], maidenName: 'Nair' });
  const divya = b.person('Divya', 'Okafor', { ...f, born: [1990, 4, 17], maidenName: 'Nair' });
  b.family(mahesh, radha, [priya, divya], { type: 'marriage', start: [1985] });
  const sam = b.person('Sam', 'Okafor', { ...m, born: [1988] });
  const ada = b.person('Ada', 'Okafor', { ...f, born: [2019, 7, 7] });
  const kofi = b.person('Kofi', 'Okafor', { ...m, born: [2021, 1, 20] });
  b.family(divya, sam, [ada, kofi], { type: 'marriage', start: [2017] });

  const daniel = b.person('Daniel', 'Wright', { ...m, born: [1985] });
  const ethan = b.person('Ethan', 'Wright', { ...m, born: [2007, 8, 1] });
  b.family(priya, daniel, [ethan], { type: 'marriage', status: 'divorced', start: [2005], end: [2009] });

  const aarav = b.person('Aarav', 'Sharma', { ...m, born: [2013, 2, 14] });
  const anika = b.person('Anika', 'Sharma', { ...f, born: [2016, 6, 6] });
  const raviPriya = b.family(ravi, priya, [aarav, anika], { type: 'marriage', start: [2011, 10, 8] });

  // Nieces and nephews (§4.5.12): Asha's children, and Karan's daughter (a half-niece).
  const james = b.person('James', 'Chen', { ...m, born: [1990] });
  const mia = b.person('Mia', 'Chen', { ...f, born: [2020, 9, 1] });
  const oliver = b.person('Oliver', 'Chen', { ...m, born: [2022, 12, 1] });
  b.family(asha, james, [mia, oliver], { type: 'partnership', start: [2017] });
  const olivia = b.person('Olivia', 'Sharma', { ...f, born: [1984] });
  const ruby = b.person('Ruby', 'Sharma', { ...f, born: [2012, 4, 4] });
  b.family(karan, olivia, [ruby], { type: 'marriage', start: [2010] });

  const marco = b.person('Marco', 'Rossi', { ...m, born: [1994] });
  const luca = b.person('Luca', 'Rossi', { ...m, born: [2024, 5, 20] });
  b.family(diya, marco, [luca], { type: 'marriage', start: [2022] });

  // Placeholder-only connector (§4.5.17): Priya's cousin Sanjay is reachable only through
  // Radha's unnamed parent and Radha's unnamed sibling.
  const radhaParent = b.placeholder();
  const radhaSibling = b.placeholder();
  const radhaFamily = b.union(radhaParent, null);
  b.child(radhaFamily, radha);
  b.child(radhaFamily, radhaSibling);
  const sanjay = b.person('Sanjay', 'Menon', { ...m, born: [1984] });
  b.family(radhaSibling, null, [sanjay]);

  // A second family in the same tree, not linked yet (§4.5.18), plus a detached person (§4.5.1).
  const george = b.person('George', 'Walker', { ...m, born: [1948] });
  const helen = b.person('Helen', 'Walker', { ...f, born: [1950, 3, 3] });
  const grace = b.person('Grace', 'Walker', { ...f, born: [1975, 7, 19] });
  b.family(george, helen, [grace], { type: 'marriage', start: [1972] });
  const samuel = b.person('Samuel', 'Osei', { ...m, born: [1970], notes: 'Family friend and executor named in the will.' });

  b.setFocus(ravi);

  const people = {
    ravi, hari, kamala, mohan, leela, sita, arun, vikram, anita, suresh, meera, priti, karan, gopal, lakshmi,
    nisha, kiran, fatima, zara, rohan, asha, dev, diya, tom, lukas, emma, sofia, noah, hannah, maya, leo, raj,
    arjun, kavya, ishaan, mahesh, radha, priya, divya, sam, ada, kofi, daniel, ethan, aarav, anika, james, mia,
    oliver, olivia, ruby, marco, luca, radhaParent, radhaSibling, sanjay, george, helen, grace, samuel,
  } satisfies Record<string, Person>;
  const unions = { mohanSita, vikramPriti, vikramNisha, sureshAlone, raviPriya, radhaFamily } satisfies Record<string, Union>;

  return { graph: b.build() as TreeGraph, people, unions };
}

export type SeedTree = ReturnType<typeof buildSeedTree>;
