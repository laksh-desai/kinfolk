import type { ParentChildKind } from '@kinfolk/shared/schemas/parentChild';
import type { Union, UnionStatus, UnionType } from '@kinfolk/shared/schemas/union';

export const KIND_OPTIONS: Array<{ value: ParentChildKind; label: string }> = [
  { value: 'biological', label: 'Birth' },
  { value: 'adopted', label: 'Adopted' },
  { value: 'step', label: 'Step' },
  { value: 'foster', label: 'Foster' },
  { value: 'guardian', label: 'Guardianship' },
];

export const UNION_TYPE_OPTIONS: Array<{ value: UnionType; label: string }> = [
  { value: 'marriage', label: 'Marriage' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'unknown', label: 'Not known' },
];

export const UNION_STATUS_OPTIONS: Array<{ value: UnionStatus; label: string }> = [
  { value: 'current', label: 'Together' },
  { value: 'separated', label: 'Separated' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'ended', label: 'Ended' },
];

/** A family in words: "Vikram Sharma and Nisha Sharma", or "Suresh Sharma (on their own)". */
export function familyLabel(names: Map<string, string>, union: Union): string {
  const a = names.get(union.partnerAId) ?? 'Unnamed person';
  if (!union.partnerBId) return `${a} (on their own)`;
  return `${a} and ${names.get(union.partnerBId) ?? 'Unnamed person'}`;
}
