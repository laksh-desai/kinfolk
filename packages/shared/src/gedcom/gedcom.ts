import type { PartialDate } from '../schemas/dates';
import type { TreeGraph } from '../schemas/graph';
import type { ParentChild, ParentChildKind } from '../schemas/parentChild';
import type { Gender, LifeStatus, Person } from '../schemas/person';
import type { Union, UnionStatus, UnionType } from '../schemas/union';

/**
 * GEDCOM 5.5.1 in and out (SPEC §5.3). Only the lineage-linked records this product models are
 * written; anything else in a file being read is reported rather than silently dropped.
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const SEX: Record<Gender, string> = { male: 'M', female: 'F', other: 'X', unknown: 'U' };
const GENDER: Record<string, Gender> = { M: 'male', F: 'female', X: 'other', U: 'unknown' };

/** PEDI carries birth, adopted, and foster; the rest is ours, in a custom tag other tools ignore. */
const PEDI: Record<ParentChildKind, string | null> = { biological: null, adopted: 'adopted', foster: 'foster', step: null, guardian: null };

export interface GedcomLine {
  level: number;
  xref: string | null;
  tag: string;
  value: string;
}

export function parseLines(text: string): GedcomLine[] {
  const lines: GedcomLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = /^(\d+)\s+(?:@([^@]+)@\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/.exec(line);
    if (!match) continue;
    lines.push({ level: Number(match[1]), xref: match[2] ?? null, tag: (match[3] ?? '').toUpperCase(), value: (match[4] ?? '').trim() });
  }
  return lines;
}

export function formatGedcomDate(date: PartialDate): string {
  const parts = [date.day ? String(date.day) : null, date.month ? MONTHS[date.month - 1] : null, String(date.year)].filter(Boolean);
  return `${date.approximate ? 'ABT ' : ''}${parts.join(' ')}`;
}

/** Reads the date forms this product can represent; ranges and other calendars are refused. */
export function parseGedcomDate(value: string): PartialDate | null {
  const text = value.trim().toUpperCase();
  if (!text || /^(BET|FROM|TO)\b/.test(text)) return null;
  const approximate = /^(ABT|EST|CAL|CIRCA)\b/.test(text);
  const body = text.replace(/^(ABT|EST|CAL|CIRCA|AFT|BEF)\s+/, '');
  const match = /^(?:(\d{1,2})\s+)?(?:([A-Z]{3})\s+)?(\d{3,4})$/.exec(body);
  if (!match) return null;
  const month = match[2] ? MONTHS.indexOf(match[2]) + 1 : 0;
  if (match[2] && month === 0) return null;
  return {
    year: Number(match[3]),
    month: month || null,
    day: match[1] && month ? Number(match[1]) : null,
    approximate,
  };
}

function nameLine(person: Person): string {
  const given = [person.firstName, person.nickname ? `"${person.nickname}"` : null].filter(Boolean).join(' ').trim();
  return `${given} /${person.lastName ?? ''}/${person.suffix ? ` ${person.suffix}` : ''}`.trim();
}

function parseName(value: string): { firstName: string; lastName: string | null; nickname: string | null; suffix: string | null } {
  const match = /^([^/]*)\/([^/]*)\/\s*(.*)$/.exec(value);
  const givenRaw = (match ? match[1] : value) ?? '';
  const nickname = /"([^"]+)"/.exec(givenRaw)?.[1] ?? null;
  const firstName = givenRaw.replace(/"[^"]*"/g, '').trim();
  const lastName = (match?.[2] ?? '').trim() || null;
  const suffix = (match?.[3] ?? '').trim() || null;
  return { firstName, lastName, nickname, suffix };
}

export interface GedcomWriteOptions {
  treeName: string;
  now?: Date;
}

/** The whole tree as a GEDCOM file. Contact details are never written. */
export function writeGedcom(graph: TreeGraph, options: GedcomWriteOptions): string {
  const now = options.now ?? new Date();
  const personRef = new Map(graph.people.map((person, index) => [person.id, `I${index + 1}`]));
  const unionRef = new Map(graph.unions.map((union, index) => [union.id, `F${index + 1}`]));
  const out: string[] = [
    '0 HEAD',
    '1 SOUR Kinfolk',
    '2 NAME Kinfolk',
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
    `1 DATE ${formatGedcomDate({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate(), approximate: false })}`,
    `1 FILE ${options.treeName}`,
  ];

  for (const person of graph.people) {
    out.push(`0 @${personRef.get(person.id)}@ INDI`);
    out.push(`1 NAME ${nameLine(person)}`);
    if (person.maidenName) out.push(`2 _MAIDEN ${person.maidenName}`);
    out.push(`1 SEX ${SEX[person.gender]}`);
    if (person.birthDate || person.birthPlace) {
      out.push('1 BIRT');
      if (person.birthDate) out.push(`2 DATE ${formatGedcomDate(person.birthDate)}`);
      if (person.birthPlace) out.push(`2 PLAC ${person.birthPlace}`);
    }
    if (person.lifeStatus === 'deceased' || person.deathDate) {
      out.push('1 DEAT');
      if (person.deathDate) out.push(`2 DATE ${formatGedcomDate(person.deathDate)}`);
    } else if (person.lifeStatus === 'living') {
      // GEDCOM has no "alive" record, only the absence of a death; keep ours in a custom tag.
      out.push('1 _LIFE living');
    }
    if (person.profession) out.push(`1 OCCU ${person.profession}`);
    if (person.isPlaceholder) out.push('1 _PLACEHOLDER Y');
    for (const edge of graph.parentChildren.filter((candidate) => candidate.childId === person.id)) {
      const family = unionRef.get(edge.unionId);
      if (!family) continue;
      out.push(`1 FAMC @${family}@`);
      const pedi = PEDI[edge.kind];
      if (pedi) out.push(`2 PEDI ${pedi}`);
      if (edge.kind !== 'biological') out.push(`2 _KIND ${edge.kind}`);
    }
    for (const union of graph.unions.filter((candidate) => candidate.partnerAId === person.id || candidate.partnerBId === person.id)) {
      out.push(`1 FAMS @${unionRef.get(union.id)}@`);
    }
  }

  for (const union of graph.unions) {
    out.push(`0 @${unionRef.get(union.id)}@ FAM`);
    const partnerA = graph.people.find((person) => person.id === union.partnerAId);
    const partnerB = union.partnerBId ? graph.people.find((person) => person.id === union.partnerBId) : undefined;
    // GEDCOM insists on HUSB/WIFE; with no recorded gender the first partner takes HUSB.
    const [husband, wife] = partnerA && partnerB && partnerA.gender === 'female' && partnerB.gender !== 'female' ? [partnerB, partnerA] : [partnerA, partnerB];
    if (husband) out.push(`1 HUSB @${personRef.get(husband.id)}@`);
    if (wife) out.push(`1 WIFE @${personRef.get(wife.id)}@`);
    for (const edge of graph.parentChildren.filter((candidate) => candidate.unionId === union.id)) {
      out.push(`1 CHIL @${personRef.get(edge.childId)}@`);
    }
    if (union.type === 'marriage' || union.startDate) {
      out.push('1 MARR');
      if (union.startDate) out.push(`2 DATE ${formatGedcomDate(union.startDate)}`);
    }
    if (union.status === 'divorced' || union.endDate) {
      out.push('1 DIV');
      if (union.endDate) out.push(`2 DATE ${formatGedcomDate(union.endDate)}`);
    }
    out.push(`1 _TYPE ${union.type}`);
    out.push(`1 _STATUS ${union.status}`);
  }

  out.push('0 TRLR');
  return `${out.join('\n')}\n`;
}

export interface GedcomImport {
  graph: TreeGraph;
  /** Things the file said that this product can't hold, in plain words. */
  problems: string[];
  counts: { people: number; families: number; parentChildren: number };
}

interface ParsedRecord {
  xref: string;
  tag: string;
  lines: GedcomLine[];
}

function groupRecords(lines: GedcomLine[]): ParsedRecord[] {
  const records: ParsedRecord[] = [];
  let current: ParsedRecord | null = null;
  for (const line of lines) {
    if (line.level === 0) {
      current = line.xref ? { xref: line.xref, tag: line.tag || line.value.toUpperCase(), lines: [] } : null;
      if (current) records.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return records;
}

/** Sub-lines of a level-1 block, e.g. the DATE under BIRT. */
function blockOf(record: ParsedRecord, tag: string): GedcomLine[] {
  const start = record.lines.findIndex((line) => line.level === 1 && line.tag === tag);
  if (start < 0) return [];
  const block: GedcomLine[] = [];
  for (let index = start + 1; index < record.lines.length; index += 1) {
    const line = record.lines[index] as GedcomLine;
    if (line.level <= 1) break;
    block.push(line);
  }
  return block;
}

const value = (lines: GedcomLine[], tag: string) => lines.find((line) => line.tag === tag)?.value ?? null;

/**
 * Reads a GEDCOM file into a graph, giving every record a fresh id. Unsupported records and
 * unreadable dates are listed so the import screen can show them before anything is written.
 */
export function parseGedcom(text: string, context: { newId: () => string; now?: string }): GedcomImport {
  const records = groupRecords(parseLines(text));
  const problems: string[] = [];
  const createdAt = context.now ?? new Date().toISOString();
  const personIds = new Map<string, string>();
  const unionIds = new Map<string, string>();
  const people: Person[] = [];
  const unions: Union[] = [];
  const parentChildren: ParentChild[] = [];

  for (const record of records) {
    if (record.tag === 'INDI') personIds.set(record.xref, context.newId());
    else if (record.tag === 'FAM') unionIds.set(record.xref, context.newId());
    else if (!['HEAD', 'TRLR', 'SUBM', 'SOUR', 'NOTE', 'OBJE', 'REPO'].includes(record.tag)) {
      problems.push(`Records of type ${record.tag} aren’t supported and were left out.`);
    }
  }

  for (const record of records.filter((entry) => entry.tag === 'INDI')) {
    const id = personIds.get(record.xref) as string;
    const rawName = value(record.lines, 'NAME') ?? '';
    const name = parseName(rawName);
    const birth = blockOf(record, 'BIRT');
    const death = blockOf(record, 'DEAT');
    const birthDateText = value(birth, 'DATE');
    const deathDateText = value(death, 'DATE');
    const birthDate = birthDateText ? parseGedcomDate(birthDateText) : null;
    const deathDate = deathDateText ? parseGedcomDate(deathDateText) : null;
    if (birthDateText && !birthDate) problems.push(`Couldn’t read the birth date “${birthDateText}” for ${name.firstName || record.xref}; the rest of their details were kept.`);
    if (deathDateText && !deathDate) problems.push(`Couldn’t read the death date “${deathDateText}” for ${name.firstName || record.xref}; the rest of their details were kept.`);
    const deceased = record.lines.some((line) => line.level === 1 && line.tag === 'DEAT');
    const declaredLife = value(record.lines, '_LIFE');
    const lifeStatus: LifeStatus = deceased ? 'deceased' : declaredLife === 'living' ? 'living' : 'unknown';
    const placeholder = record.lines.some((line) => line.tag === '_PLACEHOLDER');
    people.push({
      id,
      createdAt,
      firstName: name.firstName,
      lastName: name.lastName,
      maidenName: value(record.lines, '_MAIDEN'),
      nickname: name.nickname,
      suffix: name.suffix,
      gender: GENDER[(value(record.lines, 'SEX') ?? 'U').toUpperCase()] ?? 'unknown',
      lifeStatus,
      birthDate,
      deathDate,
      birthPlace: value(birth, 'PLAC'),
      maritalStatus: null,
      email: null,
      phone: null,
      address: null,
      photoUrl: null,
      profession: value(record.lines, 'OCCU'),
      notes: null,
      isPlaceholder: placeholder || name.firstName === '',
      details: null,
      socials: null,
      linkedTreeId: null,
    });
  }

  for (const record of records.filter((entry) => entry.tag === 'FAM')) {
    const id = unionIds.get(record.xref) as string;
    const husband = value(record.lines, 'HUSB');
    const wife = value(record.lines, 'WIFE');
    const partners = [husband, wife].map((ref) => (ref ? personIds.get(ref.replace(/@/g, '')) ?? null : null)).filter((entry): entry is string => entry !== null);
    if (partners.length === 0) {
      problems.push('A family with no parents was left out.');
      continue;
    }
    const marriage = blockOf(record, 'MARR');
    const divorce = blockOf(record, 'DIV');
    const startText = value(marriage, 'DATE');
    const endText = value(divorce, 'DATE');
    const declaredType = value(record.lines, '_TYPE');
    const declaredStatus = value(record.lines, '_STATUS');
    const married = record.lines.some((line) => line.level === 1 && line.tag === 'MARR');
    const divorced = record.lines.some((line) => line.level === 1 && line.tag === 'DIV');
    const type: UnionType = declaredType === 'marriage' || declaredType === 'partnership' || declaredType === 'unknown' ? declaredType : married ? 'marriage' : 'unknown';
    const status: UnionStatus =
      declaredStatus === 'current' || declaredStatus === 'divorced' || declaredStatus === 'separated' || declaredStatus === 'widowed' || declaredStatus === 'ended'
        ? declaredStatus
        : divorced
          ? 'divorced'
          : 'current';
    unions.push({
      id,
      createdAt,
      partnerAId: partners[0] as string,
      partnerBId: partners[1] ?? null,
      type,
      status,
      startDate: startText ? parseGedcomDate(startText) : null,
      endDate: endText ? parseGedcomDate(endText) : null,
    });

    for (const line of record.lines.filter((entry) => entry.level === 1 && entry.tag === 'CHIL')) {
      const childId = personIds.get(line.value.replace(/@/g, ''));
      if (!childId) {
        problems.push('A family listed a child who isn’t in the file; that link was left out.');
        continue;
      }
      const childRecord = records.find((entry) => entry.tag === 'INDI' && personIds.get(entry.xref) === childId);
      const famcIndex = childRecord?.lines.findIndex((entry) => entry.level === 1 && entry.tag === 'FAMC' && entry.value.replace(/@/g, '') === record.xref) ?? -1;
      let kind: ParentChildKind = 'biological';
      if (childRecord && famcIndex >= 0) {
        for (let index = famcIndex + 1; index < childRecord.lines.length; index += 1) {
          const line2 = childRecord.lines[index] as GedcomLine;
          if (line2.level <= 1) break;
          if (line2.tag === '_KIND' && ['biological', 'adopted', 'step', 'foster', 'guardian'].includes(line2.value)) kind = line2.value as ParentChildKind;
          else if (line2.tag === 'PEDI' && line2.value.toLowerCase() === 'adopted') kind = 'adopted';
          else if (line2.tag === 'PEDI' && line2.value.toLowerCase() === 'foster') kind = 'foster';
        }
      }
      parentChildren.push({ id: context.newId(), createdAt, unionId: id, childId, kind });
    }
  }

  return {
    graph: { people, unions, parentChildren, focusPersonId: people[0]?.id ?? null },
    problems: [...new Set(problems)],
    counts: { people: people.length, families: unions.length, parentChildren: parentChildren.length },
  };
}
