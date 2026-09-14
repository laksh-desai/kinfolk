import { formatPartialDate } from '@kinfolk/shared/dates/partialDate';
import type { MergeField } from '@kinfolk/shared/relatives/planMerge';
import type { Person } from '@kinfolk/shared/schemas/person';

export const MERGE_FIELD_LABELS: Record<MergeField, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  maidenName: 'Maiden name',
  nickname: 'Nickname',
  suffix: 'Suffix',
  gender: 'Gender',
  lifeStatus: 'Living or deceased',
  birthDate: 'Date of birth',
  deathDate: 'Date of death',
  birthPlace: 'Birthplace',
  maritalStatus: 'Marital status',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  photoUrl: 'Photo',
  profession: 'Profession',
  notes: 'Notes',
  details: 'Personal details',
  socials: 'Social profiles',
  planning: 'Planning answers',
};

const WORDS: Record<string, string> = { male: 'Male', female: 'Female', other: 'Other', living: 'Living', deceased: 'Deceased' };

/** A field's value as the merge screen shows it: "12 Apr 1988", "Portland, OR", "Male". */
export function mergeFieldText(person: Person, field: MergeField): string {
  const value = person[field];
  if (value === null || value === undefined || value === '') return 'Not recorded';
  switch (field) {
    case 'birthDate':
    case 'deathDate':
      return formatPartialDate(value as NonNullable<Person['birthDate']>, 'long');
    case 'address':
      return person.address?.formatted ?? ([person.address?.city, person.address?.country].filter(Boolean).join(', ') || 'Address recorded');
    case 'photoUrl':
      return 'Has a photo';
    case 'details':
    case 'socials':
    case 'planning':
      return Object.values(value as Record<string, string | null>).filter(Boolean).join(' · ') || 'Not recorded';
    default:
      return WORDS[value as string] ?? String(value);
  }
}
