import type { Kinship } from '@kinfolk/shared/kinship/resolveKinship';

const possessive = (name: string) => (name.endsWith('s') ? `${name}’` : `${name}’s`);

/**
 * A relationship as a sentence: "Emma Becker is Ravi Sharma’s first cousin". `kinship` answers
 * "alter is ego's ___", with alter = `subject` and ego = `other`.
 */
export function describeRelationship(subject: string, other: string, kinship: Kinship): string {
  if (kinship.category === 'none') return `${subject} and ${other} have no known relationship in this tree.`;
  if (kinship.category === 'distant') return `${subject} and ${other} are related — ${kinship.label.replace(/^Related — /, '')}.`;
  const label = kinship.label.charAt(0).toLowerCase() + kinship.label.slice(1);
  return `${subject} is ${possessive(other)} ${label}.`;
}
