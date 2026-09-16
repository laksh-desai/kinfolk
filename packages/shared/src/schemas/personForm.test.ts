import { describe, expect, it } from 'vitest';
import { buildSeedTree } from '../fixtures/seedTree';
import { changedFields, formValuesToFields, personFormSchema, personToFormValues, quickAddSchema, quickAddToFields } from './personForm';

function issues(values: unknown): Record<string, string> {
  const result = personFormSchema.safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]));
}

describe('quick add', () => {
  const quick = (values: Partial<Record<string, string>> = {}) => ({
    firstName: 'Maya',
    lastName: '',
    gender: 'female',
    lifeStatus: 'living',
    birthDay: '',
    birthMonth: '',
    birthYear: '',
    ...values,
  });

  it('requires only a first name; birth year is optional but must be a real year', () => {
    const empty = quickAddSchema.safeParse(quick({ firstName: '', gender: 'unknown' }));
    expect(empty.error?.issues.map((issue) => [issue.path[0], issue.message])).toEqual([['firstName', 'Enter a first name.']]);
    const bad = quickAddSchema.safeParse(quick({ birthYear: '62' }));
    expect(bad.error?.issues[0]?.message).toBe('Enter the birth year as a four-digit year, like 1962.');
    const ok = quickAddSchema.parse(quick({ firstName: ' Maya ', birthYear: '2000' }));
    expect(quickAddToFields(ok)).toEqual({ firstName: 'Maya', lastName: null, gender: 'female', lifeStatus: 'living', birthDate: { year: 2000, month: null, day: null, approximate: false }, isPlaceholder: false });
  });

  it('takes a whole date of birth, and checks it the same way the full form does', () => {
    const full = quickAddSchema.parse(quick({ birthDay: '12', birthMonth: '4', birthYear: '1988' }));
    expect(quickAddToFields(full).birthDate).toEqual({ year: 1988, month: 4, day: 12, approximate: false });
    const monthOnly = quickAddSchema.parse(quick({ birthMonth: '4', birthYear: '1988' }));
    expect(quickAddToFields(monthOnly).birthDate).toEqual({ year: 1988, month: 4, day: null, approximate: false });
    const problems = (values: Record<string, string>) =>
      Object.fromEntries((quickAddSchema.safeParse(quick(values)).error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]));
    expect(problems({ birthDay: '31', birthMonth: '2', birthYear: '1988' })).toEqual({ birthDay: 'That month only has 29 days.' });
    expect(problems({ birthDay: '12', birthYear: '1988' })).toEqual({ birthMonth: 'Choose a month to go with the day.' });
    expect(problems({ birthMonth: '4' })).toEqual({ birthYear: 'Enter the birth year too, or clear the day and month.' });
  });
});

describe('full person form', () => {
  const { people } = buildSeedTree();

  it('round-trips a full person through form values without changing anything', () => {
    for (const person of [people.ravi, people.hari, people.radhaParent]) {
      const values = personFormSchema.parse(personToFormValues(person));
      expect(changedFields(person, formValuesToFields(values))).toEqual({});
    }
  });

  it('puts each date problem on the exact field', () => {
    const base = personToFormValues(people.ravi);
    expect(issues({ ...base, birthDay: '31', birthMonth: '2', birthYear: '1988' })).toEqual({ birthDay: 'That month only has 29 days.' });
    expect(issues({ ...base, birthDay: '12', birthMonth: '', birthYear: '1988' })).toEqual({ birthMonth: 'Choose a month to go with the day.' });
    expect(issues({ ...base, birthDay: '', birthMonth: '4', birthYear: '' })).toEqual({ birthYear: 'Enter the birth year too, or clear the day and month.' });
    expect(issues({ ...base, deathYear: '2001' })).toEqual({ lifeStatus: 'Choose “Deceased” to record a date of death, or clear the date.' });
    expect(issues({ ...base, lifeStatus: 'deceased', deathYear: '1950' })).toEqual({ deathYear: 'The year of death is before the year of birth.' });
    expect(issues({ ...base, email: 'nope', firstName: '' })).toEqual({ firstName: 'Enter a first name.', email: 'Enter an email address like name@example.com.' });
  });

  it('allows an unnamed placeholder, and naming one clears the placeholder flag', () => {
    const values = personFormSchema.parse({ ...personToFormValues(people.radhaParent), firstName: 'Kala' });
    expect(formValuesToFields(values)).toMatchObject({ firstName: 'Kala', isPlaceholder: false });
    expect(issues(personToFormValues(people.radhaParent))).toEqual({});
  });

  it('only reports the fields that changed', () => {
    const values = personFormSchema.parse({ ...personToFormValues(people.ravi), nickname: 'Rav' });
    expect(changedFields(people.ravi, formValuesToFields(values))).toEqual({ nickname: 'Rav' });
  });
});
