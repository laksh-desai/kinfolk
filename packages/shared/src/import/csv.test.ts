import { describe, expect, it } from 'vitest';
import { buildSeedTree } from '../fixtures/seedTree';
import { applyChangeSet, validateGraph } from '../graph/applyChangeSet';
import { resolveKinship } from '../kinship/resolveKinship';
import type { TreeGraph } from '../schemas/graph';
import { guessMapping, parseCsv, parseCsvDate, planCsvImport, writeCsv } from './csv';

const EMPTY: TreeGraph = { people: [], unions: [], parentChildren: [], focusPersonId: null };

function idFactory(prefix = 'aaaaaaaa') {
  let n = 0;
  return () => `${prefix}-0000-4000-8000-${(++n).toString().padStart(12, '0')}`;
}

const NOW = '2026-09-15T00:00:00.000Z';

describe('CSV import (SPEC §5.3)', () => {
  it('reads quoted fields, commas, and both line endings', () => {
    const rows = parseCsv('First,Last,Notes\r\nRavi,Sharma,"Likes ""tea"", cake"\nAsha,Rao,\n\n');
    expect(rows).toEqual([
      ['First', 'Last', 'Notes'],
      ['Ravi', 'Sharma', 'Likes "tea", cake'],
      ['Asha', 'Rao', ''],
    ]);
  });

  it('guesses the columns from ordinary spreadsheet headings', () => {
    expect(guessMapping(['Given name', 'Surname', 'Sex', 'DOB', 'Father', "Mother's name", 'Email', 'Nothing useful'])).toEqual({
      firstName: 0,
      lastName: 1,
      gender: 2,
      birthDate: 3,
      father: 4,
      mother: 5,
      email: 6,
    });
  });

  it('reads the date forms people actually type', () => {
    expect(parseCsvDate('1988-04-12')).toEqual({ year: 1988, month: 4, day: 12, approximate: false });
    expect(parseCsvDate('12/04/1988')).toEqual({ year: 1988, month: 4, day: 12, approximate: false });
    expect(parseCsvDate('1988-04')).toEqual({ year: 1988, month: 4, day: null, approximate: false });
    expect(parseCsvDate('c. 1910')).toEqual({ year: 1910, month: null, day: null, approximate: true });
    expect(parseCsvDate('sometime in the 80s')).toBeNull();
    expect(parseCsvDate('')).toBeNull();
  });

  it('previews every row, links parents and partners by name, and applies as one change set', () => {
    const csv = [
      'First name,Last name,Sex,Date of birth,Father,Mother,Spouse,Email',
      'Hari,Sharma,M,1910,,,Kamala Sharma,',
      'Kamala,Sharma,F,1915-08-21,,,,',
      'Mohan,Sharma,M,1935-01-09,Hari Sharma,Kamala Sharma,,mohan@example.com',
      ',Nobody,,,,,,',
      'Vikram,Sharma,M,not a date,Mohan Sharma,Someone Missing,,',
    ].join('\n');
    const rows = parseCsv(csv);
    const plan = planCsvImport({ rows, mapping: guessMapping(rows[0] as string[]), graph: EMPTY }, { newId: idFactory(), now: NOW });

    expect(plan.counts).toMatchObject({ added: 4, matched: 0, skipped: 1 });
    expect(plan.rows.map((row) => [row.line, row.name, row.outcome])).toEqual([
      [2, 'Hari Sharma', 'added'],
      [3, 'Kamala Sharma', 'added'],
      [4, 'Mohan Sharma', 'added'],
      [5, 'Nobody', 'skipped'],
      [6, 'Vikram Sharma', 'added'],
    ]);
    expect(plan.rows[3]?.detail).toBe('No first name in this row, so there’s nobody to add.');
    expect(plan.rows[4]?.detail).toContain('“not a date” wasn’t a date we could read');
    expect(plan.rows[4]?.detail).toContain('No mother called “Someone Missing” was found');

    const after = applyChangeSet(EMPTY, plan.ops, { now: NOW }).graph;
    expect(validateGraph(after)).toEqual([]);
    const find = (first: string) => after.people.find((person) => person.firstName === first);
    const [hari, kamala, mohan, vikram] = ['Hari', 'Kamala', 'Mohan', 'Vikram'].map(find);
    expect(mohan).toMatchObject({ gender: 'male', email: 'mohan@example.com', birthDate: { year: 1935, month: 1, day: 9 } });
    expect(hari && kamala && resolveKinship(after, hari.id, kamala.id).label).toBe('Wife');
    expect(hari && mohan && resolveKinship(after, mohan.id, hari.id).label).toBe('Father');
    expect(kamala && mohan && resolveKinship(after, mohan.id, kamala.id).label).toBe('Mother');
    expect(mohan && vikram && resolveKinship(after, vikram.id, mohan.id).label).toBe('Father');
  });

  it('never overwrites someone already in the tree', () => {
    const { graph, people } = buildSeedTree();
    const rows = parseCsv(['First name,Last name,Email,Notes', 'Ravi,Sharma,new@example.com,Should not replace anything', 'Brand,New,brand@example.com,'].join('\n'));
    const plan = planCsvImport({ rows, mapping: guessMapping(rows[0] as string[]), graph }, { newId: idFactory('bbbbbbbb'), now: NOW });
    expect(plan.counts).toMatchObject({ added: 1, matched: 1 });
    expect(plan.rows[0]).toMatchObject({ name: 'Ravi Sharma', outcome: 'matched', detail: 'Already in this tree — left exactly as it is.' });
    const after = applyChangeSet(graph, plan.ops, { now: NOW }).graph;
    expect(after.people.find((person) => person.id === people.ravi.id)?.email).toBe('ravi.sharma@example.com');
    expect(after.people.some((person) => person.firstName === 'Brand')).toBe(true);
  });

  it('exports a CSV the importer can read back', () => {
    const { graph } = buildSeedTree();
    const text = writeCsv(graph);
    const rows = parseCsv(text);
    expect(rows).toHaveLength(graph.people.length + 1);
    const plan = planCsvImport({ rows, mapping: guessMapping(rows[0] as string[]), graph }, { newId: idFactory('cccccccc'), now: NOW });
    // Everyone is already there, so re-importing our own export changes nothing.
    // The two unnamed placeholders in the seed export have no first name to import.
    expect(plan.counts).toMatchObject({ added: 0, matched: graph.people.length - 2, skipped: 2 });
    expect(plan.ops).toEqual([]);

    const fresh = planCsvImport({ rows, mapping: guessMapping(rows[0] as string[]), graph: EMPTY }, { newId: idFactory('dddddddd'), now: NOW });
    const rebuilt = applyChangeSet(EMPTY, fresh.ops, { now: NOW }).graph;
    expect(validateGraph(rebuilt)).toEqual([]);
    expect(rebuilt.people).toHaveLength(graph.people.filter((person) => person.firstName.trim() !== '').length);
  });
});
