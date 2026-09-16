import { z } from 'zod';
import { partialDateSchema, type PartialDate } from './dates';

export const GENDERS = ['male', 'female', 'other', 'unknown'] as const;
export const LIFE_STATUSES = ['living', 'deceased', 'unknown'] as const;
export type Gender = (typeof GENDERS)[number];
export type LifeStatus = (typeof LIFE_STATUSES)[number];

export const uuidSchema = z.string().uuid('That id is not valid.');

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .nullable()
    .optional()
    .transform((value) => (value === undefined || value === null || value === '' ? null : value));

export const addressSchema = z.object({
  formatted: optionalText(500, 'Address'),
  street: optionalText(200, 'Street'),
  city: optionalText(120, 'City'),
  state: optionalText(120, 'State or region'),
  postalCode: optionalText(40, 'Postal code'),
  country: optionalText(120, 'Country'),
  lat: z.number().min(-90).max(90).nullable().optional().transform((value) => value ?? null),
  lng: z.number().min(-180).max(180).nullable().optional().transform((value) => value ?? null),
});
export type Address = z.output<typeof addressSchema>;

export const detailsSchema = z.object({
  favoriteDestination: optionalText(300, 'Favourite destination'),
  specialNeeds: optionalText(2000, 'Special needs'),
  hobbies: optionalText(1000, 'Hobbies'),
  favoriteFood: optionalText(300, 'Favourite food'),
  favoriteMusic: optionalText(300, 'Favourite music'),
});
export type PersonDetails = z.output<typeof detailsSchema>;

export const socialsSchema = z.object({
  facebook: optionalText(300, 'Facebook'),
  linkedin: optionalText(300, 'LinkedIn'),
  instagram: optionalText(300, 'Instagram'),
  youtube: optionalText(300, 'YouTube'),
  tiktok: optionalText(300, 'TikTok'),
});
export type PersonSocials = z.output<typeof socialsSchema>;

const emailField = z
  .string()
  .trim()
  .max(254, 'That email address is too long.')
  .email('Enter an email address like name@example.com.')
  .transform((value) => value.toLowerCase())
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null))
  .transform((value) => value ?? null);

const phoneField = z
  .string()
  .trim()
  .max(40, 'That phone number is too long.')
  .regex(/^[+()\d\s.-]{4,}$/, 'Enter a phone number using digits, spaces, and + ( ) - only.')
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null))
  .transform((value) => value ?? null);

/** Every editable person field. Only firstName (unless a placeholder), gender, and lifeStatus are required. */
export const personFieldsShape = {
  firstName: z.string().trim().max(100, 'Use 100 characters or fewer for the first name.'),
  lastName: optionalText(100, 'Last name'),
  maidenName: optionalText(100, 'Maiden name'),
  nickname: optionalText(100, 'Nickname'),
  suffix: optionalText(20, 'Suffix'),
  gender: z.enum(GENDERS, { errorMap: () => ({ message: 'Choose a gender, or “Unknown”.' }) }),
  lifeStatus: z.enum(LIFE_STATUSES, { errorMap: () => ({ message: 'Choose living, deceased, or unknown.' }) }),
  birthDate: partialDateSchema.nullable().optional().transform((value) => value ?? null),
  deathDate: partialDateSchema.nullable().optional().transform((value) => value ?? null),
  birthPlace: optionalText(200, 'Birthplace'),
  maritalStatus: optionalText(60, 'Marital status'),
  email: emailField,
  phone: phoneField,
  address: addressSchema.nullable().optional().transform((value) => value ?? null),
  photoUrl: optionalText(500, 'Photo'),
  publicRecordUrl: optionalText(500, 'Public records'),
  profession: optionalText(200, 'Profession'),
  notes: optionalText(5000, 'Notes'),
  isPlaceholder: z.boolean().optional().transform((value) => value ?? false),
  details: detailsSchema.nullable().optional().transform((value) => value ?? null),
  socials: socialsSchema.nullable().optional().transform((value) => value ?? null),
  linkedTreeId: uuidSchema.nullable().optional().transform((value) => value ?? null),
};

export interface PersonFields {
  firstName: string;
  lastName: string | null;
  maidenName: string | null;
  nickname: string | null;
  suffix: string | null;
  gender: Gender;
  lifeStatus: LifeStatus;
  birthDate: PartialDate | null;
  deathDate: PartialDate | null;
  birthPlace: string | null;
  maritalStatus: string | null;
  email: string | null;
  phone: string | null;
  address: Address | null;
  photoUrl: string | null;
  /** A PDF of this person's public records, stored under this tree. Server-managed. */
  publicRecordUrl: string | null;
  profession: string | null;
  notes: string | null;
  isPlaceholder: boolean;
  details: PersonDetails | null;
  socials: PersonSocials | null;
  linkedTreeId: string | null;
}

export interface Person extends PersonFields {
  id: string;
  createdAt: string;
}

/** Rules that span fields. Returned as field → message so forms and the API report them the same way. */
export function personConsistencyIssues(person: Pick<PersonFields, 'firstName' | 'isPlaceholder' | 'lifeStatus' | 'birthDate' | 'deathDate'>): Record<string, string> {
  const issues: Record<string, string> = {};
  if (!person.isPlaceholder && person.firstName.trim() === '') issues.firstName = 'Enter a first name.';
  if (person.deathDate && person.lifeStatus === 'living') {
    issues.deathDate = 'Mark this person as deceased to add a date of death.';
  }
  if (person.birthDate && person.deathDate && compareYearMonthDay(person.deathDate, person.birthDate) < 0) {
    issues.deathDate = 'The date of death is before the date of birth.';
  }
  return issues;
}

function compareYearMonthDay(a: PartialDate, b: PartialDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month == null || b.month == null) return 0;
  if (a.month !== b.month) return a.month - b.month;
  if (a.day == null || b.day == null) return 0;
  return a.day - b.day;
}

export const personFieldsSchema = z.object(personFieldsShape).superRefine((value, ctx) => {
  for (const [path, message] of Object.entries(personConsistencyIssues(value))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  }
});

export const personCreateSchema = z
  .object({ id: uuidSchema, createdAt: z.string().datetime().optional(), ...personFieldsShape })
  .superRefine((value, ctx) => {
    for (const [path, message] of Object.entries(personConsistencyIssues(value))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    }
  });

/** A patch: any subset of fields. The merged person is re-checked with personConsistencyIssues. */
export const personPatchSchema = z
  .object(Object.fromEntries(Object.entries(personFieldsShape).map(([key, schema]) => [key, schema.optional()])) as {
    [K in keyof typeof personFieldsShape]: z.ZodOptional<(typeof personFieldsShape)[K]>;
  })
  .strict();
export type PersonPatch = Partial<PersonFields>;

/** What a share-link visitor may see (SPEC §2, QUESTIONS Q8). Nothing else leaves the server. */
export interface RedactedPerson {
  id: string;
  createdAt: string;
  firstName: string;
  lastName: string | null;
  maidenName: string | null;
  nickname: string | null;
  suffix: string | null;
  gender: Gender;
  lifeStatus: LifeStatus;
  birthYear: number | null;
  isPlaceholder: boolean;
}

export const REDACTED_PERSON_KEYS = [
  'id',
  'createdAt',
  'firstName',
  'lastName',
  'maidenName',
  'nickname',
  'suffix',
  'gender',
  'lifeStatus',
  'birthYear',
  'isPlaceholder',
] as const satisfies ReadonlyArray<keyof RedactedPerson>;
