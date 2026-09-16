import { PlanState, blankPerson, type PlanContext } from '../relatives/planState';
import type { ChangeOp } from '../schemas/changeSet';
import type { PartialDate } from '../schemas/dates';
import type { TreeGraph } from '../schemas/graph';
import { GENDERS, LIFE_STATUSES, type Gender, type LifeStatus } from '../schemas/person';

/** Splits CSV text, honouring quotes, escaped quotes, and both line endings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // a spreadsheet's byte-order mark
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quoted) {
      if (char === '"' && body[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r') continue;
    else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.trim() !== ''));
}

export const CSV_FIELDS = [
  'firstName',
  'lastName',
  'maidenName',
  'gender',
  'lifeStatus',
  'birthDate',
  'deathDate',
  'birthPlace',
  'email',
  'phone',
  'address',
  'profession',
  'notes',
  'father',
  'mother',
  'spouse',
] as const;
export type CsvField = (typeof CSV_FIELDS)[number];

export const CSV_FIELD_LABELS: Record<CsvField, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  maidenName: 'Maiden name',
  gender: 'Gender',
  lifeStatus: 'Living or deceased',
  birthDate: 'Date of birth',
  deathDate: 'Date of death',
  birthPlace: 'Birthplace',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  profession: 'Profession',
  notes: 'Notes',
  father: 'Father’s name',
  mother: 'Mother’s name',
  spouse: 'Spouse or partner’s name',
};

const HINTS: Record<CsvField, string[]> = {
  firstName: ['first name', 'firstname', 'given name', 'given', 'forename', 'first'],
  lastName: ['last name', 'lastname', 'surname', 'family name', 'last'],
  maidenName: ['maiden name', 'maiden', 'birth surname', 'nee'],
  gender: ['gender', 'sex'],
  lifeStatus: ['living', 'life status', 'status', 'alive', 'deceased'],
  birthDate: ['date of birth', 'birth date', 'birthdate', 'dob', 'born', 'birthday'],
  deathDate: ['date of death', 'death date', 'deathdate', 'dod', 'died'],
  birthPlace: ['birthplace', 'place of birth', 'birth place', 'born in'],
  email: ['email', 'e-mail', 'email address'],
  phone: ['phone', 'telephone', 'mobile', 'cell'],
  address: ['address', 'home address', 'street address'],
  profession: ['profession', 'occupation', 'job', 'work'],
  notes: ['notes', 'note', 'comments'],
  father: ['father', 'father name', 'dad', 'parent 1', 'father’s name', "father's name"],
  mother: ['mother', 'mother name', 'mum', 'mom', 'parent 2', 'mother’s name', "mother's name"],
  spouse: ['spouse', 'partner', 'husband', 'wife', 'married to'],
};

export type CsvMapping = Partial<Record<CsvField, number>>;

/** A first guess at which column is which, so most files need no manual mapping at all. */
export function guessMapping(headers: string[]): CsvMapping {
  const mapping: CsvMapping = {};
  const normalised = headers.map((header) => header.trim().toLowerCase().replace(/[_-]+/g, ' '));
  for (const field of CSV_FIELDS) {
    const index = normalised.findIndex((header, position) => !Object.values(mapping).includes(position) && HINTS[field].includes(header));
    if (index >= 0) mapping[field] = index;
  }
  return mapping;
}

export function parseCsvDate(value: string): PartialDate | null {
  const text = value.trim();
  if (!text) return null;
  const iso = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(text);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: iso[3] ? Number(iso[3]) : null, approximate: false };
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  // Day first: the spec's audience is UK and Indian families; an ambiguous 03/04/1988 is 3 April.
  if (slash) return { year: Number(slash[3]), month: Number(slash[2]), day: Number(slash[1]), approximate: false };
  const yearOnly = /^(?:c\.?|about|circa|approx\.?)?\s*(\d{4})$/i.exec(text);
  if (yearOnly) return { year: Number(yearOnly[1]), month: null, day: null, approximate: /^(c\.?|about|circa|approx)/i.test(text) };
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(text)) {
    return { year: parsed.getUTCFullYear(), month: parsed.getUTCMonth() + 1, day: parsed.getUTCDate(), approximate: false };
  }
  return null;
}

function parseGender(value: string): Gender {
  const text = value.trim().toLowerCase();
  if (['m', 'male', 'man', 'boy'].includes(text)) return 'male';
  if (['f', 'female', 'woman', 'girl'].includes(text)) return 'female';
  return (GENDERS as readonly string[]).includes(text) ? (text as Gender) : 'unknown';
}

function parseLifeStatus(value: string, deathDate: PartialDate | null): LifeStatus {
  const text = value.trim().toLowerCase();
  if (['living', 'alive', 'yes', 'y', 'true'].includes(text)) return 'living';
  if (['deceased', 'dead', 'no', 'n', 'false', 'died'].includes(text)) return 'deceased';
  if ((LIFE_STATUSES as readonly string[]).includes(text)) return text as LifeStatus;
  return deathDate ? 'deceased' : 'unknown';
}

export interface CsvRowResult {
  /** 1-based row number in the file, counting the header. */
  line: number;
  name: string;
  outcome: 'added' | 'matched' | 'skipped';
  /** What will happen, or why nothing will: always in plain words. */
  detail: string;
}

export interface CsvImportPlan {
  ops: ChangeOp[];
  rows: CsvRowResult[];
  counts: { added: number; matched: number; skipped: number; relationships: number };
}

const fullName = (first: string, last: string | null) => [first, last].filter(Boolean).join(' ').trim();
const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Turns mapped CSV rows into one change set, with a preview of every row first (SPEC §5.3).
 * Nothing is written until the person confirms; matched people are left as they are, so an
 * import can never quietly overwrite what is already in the tree.
 */
export function planCsvImport(input: { rows: string[][]; mapping: CsvMapping; graph: TreeGraph }, context: PlanContext): CsvImportPlan {
  const [, ...dataRows] = input.rows;
  const state = new PlanState(input.graph, context);
  const results: CsvRowResult[] = [];
  const byName = new Map<string, string>();
  for (const person of input.graph.people) {
    const name = key(fullName(person.firstName, person.lastName));
    if (name && !byName.has(name)) byName.set(name, person.id);
  }
  let relationships = 0;

  const cell = (row: string[], field: CsvField) => {
    const index = input.mapping[field];
    return index === undefined ? '' : (row[index] ?? '').trim();
  };

  // First pass: people. Relationships come after, so a row can point at someone further down.
  const pending: Array<{ row: string[]; id: string; line: number }> = [];
  dataRows.forEach((row, position) => {
    const line = position + 2;
    const firstName = cell(row, 'firstName');
    const lastName = cell(row, 'lastName') || null;
    const name = fullName(firstName, lastName);
    if (!firstName) {
      results.push({ line, name: name || '(no name)', outcome: 'skipped', detail: 'No first name in this row, so there’s nobody to add.' });
      return;
    }
    const existing = byName.get(key(name));
    if (existing) {
      results.push({ line, name, outcome: 'matched', detail: 'Already in this tree — left exactly as it is.' });
      pending.push({ row, id: existing, line });
      return;
    }
    const birthDate = parseCsvDate(cell(row, 'birthDate'));
    const deathDate = parseCsvDate(cell(row, 'deathDate'));
    const rawBirth = cell(row, 'birthDate');
    const address = cell(row, 'address');
    const person = blankPerson(context.newId(), {
      firstName,
      lastName,
      maidenName: cell(row, 'maidenName') || null,
      gender: parseGender(cell(row, 'gender')),
      lifeStatus: parseLifeStatus(cell(row, 'lifeStatus'), deathDate),
      birthDate,
      deathDate,
      birthPlace: cell(row, 'birthPlace') || null,
      email: cell(row, 'email') ? cell(row, 'email').toLowerCase() : null,
      phone: cell(row, 'phone') || null,
      address: address ? { formatted: address, street: null, city: null, state: null, postalCode: null, country: null, lat: null, lng: null } : null,
      profession: cell(row, 'profession') || null,
      notes: cell(row, 'notes') || null,
      isPlaceholder: false,
    });
    state.addPerson(person);
    byName.set(key(name), person.id);
    pending.push({ row, id: person.id, line });
    const dateNote = rawBirth && !birthDate ? ` The date of birth “${rawBirth}” wasn’t a date we could read, so it was left out.` : '';
    results.push({ line, name, outcome: 'added', detail: `New person.${dateNote}` });
  });

  // Second pass: parents and partners, by name. Both parents are linked together, so a couple
  // named on several rows ends up as one family rather than one union per row.
  const unionBetween = (a: string, b: string) =>
    state.index.unionsOf(a).find((union) => union.partnerAId === b || union.partnerBId === b) ?? null;

  for (const entry of pending) {
    const result = results.find((candidate) => candidate.line === entry.line);
    const note = (text: string) => {
      if (result) result.detail += ` ${text}`;
    };
    const lookup = (field: 'father' | 'mother' | 'spouse') => {
      const name = cell(entry.row, field);
      if (!name) return null;
      const id = byName.get(key(name));
      if (!id) {
        note(`No ${field === 'spouse' ? 'partner' : field} called “${name}” was found, so that link was left out.`);
        return null;
      }
      return id === entry.id ? null : id;
    };

    try {
      const parents = [lookup('father'), lookup('mother')].filter((id): id is string => id !== null);
      if (parents.length > 0) {
        const already = state.index.parentsOf(entry.id).map((parent) => parent.parentId);
        const missing = parents.filter((id) => !already.includes(id));
        if (missing.length > 0 && already.length + missing.length > 2) {
          note('They already have two parents, so the extra one wasn’t linked.');
        } else if (missing.length > 0) {
          const existingEdge = state.index.parentEdgesOf(entry.id)[0];
          const pair = parents.length === 2 ? unionBetween(parents[0] as string, parents[1] as string) : null;
          const solo = parents.length === 1 ? state.index.unionsOf(parents[0] as string).find((union) => union.partnerBId === null) ?? null : null;
          if (existingEdge) {
            const union = state.index.union(existingEdge.unionId);
            if (union && union.partnerBId === null && missing[0]) state.push({ op: 'union.update', id: union.id, patch: { partnerBId: missing[0] } });
          } else {
            const unionId = pair?.id ?? solo?.id ?? state.addUnion(parents[0] as string, parents[1] ?? null);
            state.addEdge(unionId, entry.id, 'biological');
          }
          relationships += missing.length;
        }
      }

      const spouseId = lookup('spouse');
      if (spouseId) {
        const existing = unionBetween(entry.id, spouseId);
        if (!existing) {
          state.addUnion(entry.id, spouseId, 'marriage', 'current');
          relationships += 1;
        } else if (existing.type === 'unknown') {
          // The couple already share a family from a child's row; the spouse column says it's a marriage.
          state.push({ op: 'union.update', id: existing.id, patch: { type: 'marriage' } });
        }
      }
    } catch (error) {
      note(error instanceof Error ? error.message : 'Some links in this row couldn’t be made.');
    }
  }

  return {
    ops: state.ops,
    rows: results,
    counts: {
      added: results.filter((row) => row.outcome === 'added').length,
      matched: results.filter((row) => row.outcome === 'matched').length,
      skipped: results.filter((row) => row.outcome === 'skipped').length,
      relationships,
    },
  };
}

/** The tree as a CSV the same importer can read back. */
export function writeCsv(graph: TreeGraph): string {
  const index = new Map(graph.people.map((person) => [person.id, person]));
  const nameOf = (id: string | null | undefined) => {
    const person = id ? index.get(id) : undefined;
    return person ? fullName(person.firstName, person.lastName) : '';
  };
  const dateOf = (date: PartialDate | null) => (date ? [String(date.year).padStart(4, '0'), date.month ? String(date.month).padStart(2, '0') : null, date.day ? String(date.day).padStart(2, '0') : null].filter(Boolean).join('-') : '');
  const headers = ['First name', 'Last name', 'Maiden name', 'Gender', 'Living or deceased', 'Date of birth', 'Date of death', 'Birthplace', 'Email', 'Phone', 'Address', 'Profession', 'Notes', 'Father', 'Mother', 'Spouse'];
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

  const lines = [headers.join(',')];
  for (const person of graph.people) {
    const parentEdges = graph.parentChildren.filter((edge) => edge.childId === person.id);
    const parentUnion = parentEdges.length > 0 ? graph.unions.find((union) => union.id === parentEdges[0]?.unionId) : undefined;
    const parents = parentUnion ? [index.get(parentUnion.partnerAId), parentUnion.partnerBId ? index.get(parentUnion.partnerBId) : undefined].filter(Boolean) : [];
    const father = parents.find((parent) => parent?.gender === 'male');
    const mother = parents.find((parent) => parent?.gender === 'female');
    const partnerUnion = graph.unions.find((union) => (union.partnerAId === person.id || union.partnerBId === person.id) && union.partnerBId !== null && union.status === 'current');
    const partnerId = partnerUnion ? (partnerUnion.partnerAId === person.id ? partnerUnion.partnerBId : partnerUnion.partnerAId) : null;
    lines.push(
      [
        person.firstName,
        person.lastName ?? '',
        person.maidenName ?? '',
        person.gender,
        person.lifeStatus,
        dateOf(person.birthDate),
        dateOf(person.deathDate),
        person.birthPlace ?? '',
        person.email ?? '',
        person.phone ?? '',
        person.address?.formatted ?? '',
        person.profession ?? '',
        person.notes ?? '',
        father ? nameOf(father.id) : '',
        mother ? nameOf(mother.id) : '',
        nameOf(partnerId),
      ]
        .map((value) => escape(String(value)))
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}
