import type { Gender } from '../schemas/person';

export type Side = 'maternal' | 'paternal' | null;

const ORDINAL_WORDS = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
const COUNT_WORDS = ['', 'once', 'twice', 'three times', 'four times', 'five times', 'six times', 'seven times', 'eight times', 'nine times', 'ten times'];

export function ordinalWord(n: number): string {
  return ORDINAL_WORDS[n] ?? numericOrdinal(n);
}

export function numericOrdinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export function possessive(text: string): string {
  return text.endsWith('s') ? `${text}’` : `${text}’s`;
}

/** Gendered word, or the neutral one for `other` and `unknown` (QUESTIONS Q17). */
export function gendered(gender: Gender | undefined, male: string, female: string, neutral: string): string {
  if (gender === 'male') return male;
  if (gender === 'female') return female;
  return neutral;
}

/** "", "Great-", "Great-great-", "3rd great-" for 0, 1, 2, 3 greats. */
function greats(count: number): string {
  if (count <= 0) return '';
  if (count === 1) return 'Great-';
  if (count === 2) return 'Great-great-';
  return `${numericOrdinal(count)} great-`;
}

function withGreats(count: number, base: string): string {
  const prefix = greats(count);
  return prefix ? `${prefix}${base}` : capitalise(base);
}

function withSide(side: Side, label: string): string {
  if (!side) return label;
  return `${side === 'maternal' ? 'Maternal' : 'Paternal'} ${lowerFirst(label)}`;
}

/** Alter is ego's ancestor `generations` up. */
export function ancestorLabel(generations: number, gender: Gender | undefined, side: Side): string {
  if (generations === 1) return gendered(gender, 'Father', 'Mother', 'Parent');
  const base = gendered(gender, 'grandfather', 'grandmother', 'grandparent');
  return withSide(side, withGreats(generations - 2, base));
}

/** Alter is ego's descendant `generations` down. */
export function descendantLabel(generations: number, gender: Gender | undefined): string {
  if (generations === 1) return gendered(gender, 'Son', 'Daughter', 'Child');
  return withGreats(generations - 2, gendered(gender, 'grandson', 'granddaughter', 'grandchild'));
}

export function siblingLabel(gender: Gender | undefined, half: boolean): string {
  const word = gendered(gender, 'brother', 'sister', 'sibling');
  return half ? `Half-${word}` : capitalise(word);
}

/** Alter is a sibling of ego's ancestor `ancestorGenerations` up (2 = aunt/uncle). */
export function auntUncleLabel(ancestorGenerations: number, gender: Gender | undefined, side: Side, half: boolean): string {
  const count = ancestorGenerations - 2;
  if (gender === 'male' || gender === 'female') {
    const word = gender === 'male' ? 'uncle' : 'aunt';
    const core = half ? `half-${word}` : word;
    return withSide(side, withGreats(count, core));
  }
  const sibling = half ? 'half-sibling' : 'sibling';
  if (count === 0) {
    if (side) return `${side === 'maternal' ? 'Mother' : 'Father'}’s ${sibling}`;
    return `Parent’s ${sibling}`;
  }
  return withSide(side, `${withGreats(count - 1, 'grandparent')}’s ${sibling}`);
}

/** Alter is a descendant, `generations` down, of ego's sibling (2 = niece/nephew). */
export function nieceNephewLabel(generations: number, gender: Gender | undefined, half: boolean): string {
  const count = generations - 2;
  if (gender === 'male' || gender === 'female') {
    const word = gender === 'male' ? 'nephew' : 'niece';
    return withGreats(count, half ? `half-${word}` : word);
  }
  const sibling = half ? 'Half-sibling' : 'Sibling';
  return count === 0 ? `${sibling}’s child` : `${sibling}’s ${lowerFirst(withGreats(count - 1, 'grandchild'))}`;
}

export function cousinLabel(egoUp: number, alterUp: number, half: boolean): string {
  const degree = Math.min(egoUp, alterUp) - 1;
  const removal = Math.abs(egoUp - alterUp);
  const base = `${half ? 'Half ' : ''}${half ? lowerFirst(ordinalWord(degree)) : ordinalWord(degree)} cousin`;
  if (removal === 0) return base;
  return `${base} ${COUNT_WORDS[removal] ?? `${removal} times`} removed`;
}

export function partnerWord(gender: Gender | undefined, type: 'marriage' | 'partnership' | 'unknown'): string {
  return type === 'marriage' ? gendered(gender, 'Husband', 'Wife', 'Spouse') : 'Partner';
}

/** "Mother-in-law", "Brother-in-law", "Grandson-in-law". */
export function inLaw(label: string): string {
  return `${label}-in-law`;
}
