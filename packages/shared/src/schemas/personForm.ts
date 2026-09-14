import { z } from 'zod';
import { daysInMonth, MAX_YEAR, MIN_YEAR, type PartialDate } from './dates';
import {
  GENDERS,
  LIFE_STATUSES,
  personFieldsShape,
  type Address,
  type Person,
  type PersonDetails,
  type PersonPatch,
  type PersonPlanning,
  type PersonSocials,
} from './person';

/**
 * Form-shaped person schemas: every input is a string, exactly as typed. They reuse the field
 * rules in person.ts (the same ones the API applies to ChangeOps) and add the messages a person
 * filling in the form needs, attached to the precise field.
 */

const text = (max: number, label: string) => z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);

const yearText = (label: string) =>
  z
    .string()
    .trim()
    .refine((value) => value === '' || (/^\d{4}$/.test(value) && Number(value) >= MIN_YEAR && Number(value) <= MAX_YEAR), {
      message: `Enter the ${label} as a four-digit year, like 1962.`,
    });

export const quickAddSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter a first name.').max(100, 'Use 100 characters or fewer for the first name.'),
  lastName: text(100, 'Last name'),
  gender: z.enum(GENDERS, { errorMap: () => ({ message: 'Choose a gender, or “Unknown”.' }) }),
  lifeStatus: z.enum(LIFE_STATUSES, { errorMap: () => ({ message: 'Choose living, deceased, or unknown.' }) }),
  birthYear: yearText('birth year'),
});
export type QuickAddValues = z.input<typeof quickAddSchema>;

export function quickAddToFields(values: z.output<typeof quickAddSchema>): Pick<Person, 'firstName' | 'lastName' | 'gender' | 'lifeStatus' | 'birthDate' | 'isPlaceholder'> {
  return {
    firstName: values.firstName,
    lastName: values.lastName || null,
    gender: values.gender,
    lifeStatus: values.lifeStatus,
    birthDate: values.birthYear ? { year: Number(values.birthYear), month: null, day: null, approximate: false } : null,
    isPlaceholder: false,
  };
}

export const personFormSchema = z
  .object({
    firstName: z.string().trim().max(100, 'Use 100 characters or fewer for the first name.'),
    isPlaceholder: z.boolean(),
    lastName: text(100, 'Last name'),
    maidenName: text(100, 'Maiden name'),
    nickname: text(100, 'Nickname'),
    suffix: text(20, 'Suffix'),
    gender: quickAddSchema.shape.gender,
    lifeStatus: quickAddSchema.shape.lifeStatus,
    birthDay: z.string().trim(),
    birthMonth: z.string().trim(),
    birthYear: yearText('birth year'),
    birthApproximate: z.boolean(),
    deathDay: z.string().trim(),
    deathMonth: z.string().trim(),
    deathYear: yearText('death year'),
    deathApproximate: z.boolean(),
    birthPlace: text(200, 'Birthplace'),
    maritalStatus: text(60, 'Marital status'),
    email: z.string().trim().refine((value) => value === '' || personFieldsShape.email.safeParse(value).success, { message: 'Enter an email address like name@example.com.' }),
    phone: z.string().trim().refine((value) => value === '' || personFieldsShape.phone.safeParse(value).success, { message: 'Enter a phone number using digits, spaces, and + ( ) - only.' }),
    addressFormatted: text(500, 'Address'),
    addressStreet: text(200, 'Street'),
    addressCity: text(120, 'City'),
    addressState: text(120, 'State or region'),
    addressPostalCode: text(40, 'Postal code'),
    addressCountry: text(120, 'Country'),
    profession: text(200, 'Profession'),
    notes: text(5000, 'Notes'),
    hobbies: text(1000, 'Hobbies'),
    favoriteDestination: text(300, 'Favourite destination'),
    favoriteFood: text(300, 'Favourite food'),
    favoriteMusic: text(300, 'Favourite music'),
    specialNeeds: text(2000, 'Special needs'),
    facebook: text(300, 'Facebook'),
    linkedin: text(300, 'LinkedIn'),
    instagram: text(300, 'Instagram'),
    youtube: text(300, 'YouTube'),
    tiktok: text(300, 'TikTok'),
    overallObjective: text(4000, 'Overall objective'),
    areasOfConcern: text(4000, 'Areas of concern'),
    marketOutlook: text(4000, 'Market outlook'),
    familyRelationships: text(4000, 'Family relationships'),
    rateOfReturnView: text(4000, 'Rate of return view'),
  })
  .superRefine((values, ctx) => {
    if (!values.isPlaceholder && values.firstName === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['firstName'], message: 'Enter a first name.' });
    }
    for (const prefix of ['birth', 'death'] as const) {
      const label = prefix === 'birth' ? 'birth' : 'death';
      const day = values[`${prefix}Day`];
      const month = values[`${prefix}Month`];
      const year = values[`${prefix}Year`];
      if ((day || month) && !year) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [`${prefix}Year`], message: `Enter the ${label} year too, or clear the day and month.` });
      if (day && !month) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [`${prefix}Month`], message: 'Choose a month to go with the day.' });
      if (day && !/^\d{1,2}$/.test(day)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [`${prefix}Day`], message: 'Enter the day as a number from 1 to 31.' });
      if (day && month && /^\d{4}$/.test(year) && /^\d{1,2}$/.test(day)) {
        const max = daysInMonth(Number(year), Number(month));
        if (Number(day) < 1 || Number(day) > max) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [`${prefix}Day`], message: `That month only has ${max} days.` });
        }
      }
    }
    const hasDeath = Boolean(values.deathYear || values.deathMonth || values.deathDay);
    if (hasDeath && values.lifeStatus === 'living') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lifeStatus'], message: 'Choose “Deceased” to record a date of death, or clear the date.' });
    }
    if (/^\d{4}$/.test(values.birthYear) && /^\d{4}$/.test(values.deathYear) && Number(values.deathYear) < Number(values.birthYear)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deathYear'], message: 'The year of death is before the year of birth.' });
    }
  });
export type PersonFormValues = z.input<typeof personFormSchema>;

const orEmpty = (value: string | null | undefined) => value ?? '';

function dateToParts(date: PartialDate | null) {
  return {
    day: date?.day ? String(date.day) : '',
    month: date?.month ? String(date.month) : '',
    year: date ? String(date.year) : '',
    approximate: date?.approximate ?? false,
  };
}

export function personToFormValues(person: Person): PersonFormValues {
  const birth = dateToParts(person.birthDate);
  const death = dateToParts(person.deathDate);
  return {
    firstName: person.firstName,
    isPlaceholder: person.isPlaceholder,
    lastName: orEmpty(person.lastName),
    maidenName: orEmpty(person.maidenName),
    nickname: orEmpty(person.nickname),
    suffix: orEmpty(person.suffix),
    gender: person.gender,
    lifeStatus: person.lifeStatus,
    birthDay: birth.day,
    birthMonth: birth.month,
    birthYear: birth.year,
    birthApproximate: birth.approximate,
    deathDay: death.day,
    deathMonth: death.month,
    deathYear: death.year,
    deathApproximate: death.approximate,
    birthPlace: orEmpty(person.birthPlace),
    maritalStatus: orEmpty(person.maritalStatus),
    email: orEmpty(person.email),
    phone: orEmpty(person.phone),
    addressFormatted: orEmpty(person.address?.formatted),
    addressStreet: orEmpty(person.address?.street),
    addressCity: orEmpty(person.address?.city),
    addressState: orEmpty(person.address?.state),
    addressPostalCode: orEmpty(person.address?.postalCode),
    addressCountry: orEmpty(person.address?.country),
    profession: orEmpty(person.profession),
    notes: orEmpty(person.notes),
    hobbies: orEmpty(person.details?.hobbies),
    favoriteDestination: orEmpty(person.details?.favoriteDestination),
    favoriteFood: orEmpty(person.details?.favoriteFood),
    favoriteMusic: orEmpty(person.details?.favoriteMusic),
    specialNeeds: orEmpty(person.details?.specialNeeds),
    facebook: orEmpty(person.socials?.facebook),
    linkedin: orEmpty(person.socials?.linkedin),
    instagram: orEmpty(person.socials?.instagram),
    youtube: orEmpty(person.socials?.youtube),
    tiktok: orEmpty(person.socials?.tiktok),
    overallObjective: orEmpty(person.planning?.overallObjective),
    areasOfConcern: orEmpty(person.planning?.areasOfConcern),
    marketOutlook: orEmpty(person.planning?.marketOutlook),
    familyRelationships: orEmpty(person.planning?.familyRelationships),
    rateOfReturnView: orEmpty(person.planning?.rateOfReturnView),
  };
}

const nullIfEmpty = (value: string) => (value.trim() === '' ? null : value.trim());

function partsToDate(day: string, month: string, year: string, approximate: boolean): PartialDate | null {
  if (!year) return null;
  return { year: Number(year), month: month ? Number(month) : null, day: month && day ? Number(day) : null, approximate };
}

function allNull<T extends object>(value: T): T | null {
  return Object.values(value).every((entry) => entry === null) ? null : value;
}

/** Turns validated form values into person fields. Planning is included only when the caller may edit it. */
export function formValuesToFields(values: z.output<typeof personFormSchema>, options: { includePlanning: boolean }): PersonPatch {
  const address: Address = {
    formatted: nullIfEmpty(values.addressFormatted),
    street: nullIfEmpty(values.addressStreet),
    city: nullIfEmpty(values.addressCity),
    state: nullIfEmpty(values.addressState),
    postalCode: nullIfEmpty(values.addressPostalCode),
    country: nullIfEmpty(values.addressCountry),
    lat: null,
    lng: null,
  };
  const details: PersonDetails = {
    hobbies: nullIfEmpty(values.hobbies),
    favoriteDestination: nullIfEmpty(values.favoriteDestination),
    favoriteFood: nullIfEmpty(values.favoriteFood),
    favoriteMusic: nullIfEmpty(values.favoriteMusic),
    specialNeeds: nullIfEmpty(values.specialNeeds),
  };
  const socials: PersonSocials = {
    facebook: nullIfEmpty(values.facebook),
    linkedin: nullIfEmpty(values.linkedin),
    instagram: nullIfEmpty(values.instagram),
    youtube: nullIfEmpty(values.youtube),
    tiktok: nullIfEmpty(values.tiktok),
  };
  const planning: PersonPlanning = {
    overallObjective: nullIfEmpty(values.overallObjective),
    areasOfConcern: nullIfEmpty(values.areasOfConcern),
    marketOutlook: nullIfEmpty(values.marketOutlook),
    familyRelationships: nullIfEmpty(values.familyRelationships),
    rateOfReturnView: nullIfEmpty(values.rateOfReturnView),
  };
  const named = values.firstName.trim() !== '';
  const fields: PersonPatch = {
    firstName: values.firstName.trim(),
    isPlaceholder: values.isPlaceholder && !named,
    lastName: nullIfEmpty(values.lastName),
    maidenName: nullIfEmpty(values.maidenName),
    nickname: nullIfEmpty(values.nickname),
    suffix: nullIfEmpty(values.suffix),
    gender: values.gender,
    lifeStatus: values.lifeStatus,
    birthDate: partsToDate(values.birthDay, values.birthMonth, values.birthYear, values.birthApproximate),
    deathDate: partsToDate(values.deathDay, values.deathMonth, values.deathYear, values.deathApproximate),
    birthPlace: nullIfEmpty(values.birthPlace),
    maritalStatus: nullIfEmpty(values.maritalStatus),
    email: values.email ? values.email.trim().toLowerCase() : null,
    phone: nullIfEmpty(values.phone),
    address: allNull(address),
    profession: nullIfEmpty(values.profession),
    notes: nullIfEmpty(values.notes),
    details: allNull(details),
    socials: allNull(socials),
  };
  if (options.includePlanning) fields.planning = allNull(planning);
  return fields;
}

/** Only the fields that actually changed, so an edit never overwrites anything it didn't touch. */
export function changedFields(person: Person, next: PersonPatch): PersonPatch {
  const patch: PersonPatch = {};
  for (const [key, value] of Object.entries(next) as Array<[keyof PersonPatch, unknown]>) {
    if (JSON.stringify(person[key] ?? null) !== JSON.stringify(value ?? null)) (patch as Record<string, unknown>)[key] = value;
  }
  return patch;
}
