import { describe, expect, it } from 'vitest';
import { buildSeedTree } from '../fixtures/seedTree';
import { changedFields, formValuesToFields, personFormSchema, personToFormValues, quickAddSchema, quickAddToFields } from './personForm';

function issues(values: unknown): Record<string, string> {
  const result = personFormSchema.safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]));
}

describe('quick add', () => {
  it('requires only a first name; birth year is optional but must be a real year', () => {
    const empty = quickAddSchema.safeParse({ firstName: '', lastName: '', gender: 'unknown', lifeStatus: 'living', birthYear: '' });
    expect(empty.error?.issues.map((issue) => [issue.path[0], issue.message])).toEqual([['firstName', 'Enter a first name.']]);
    const bad = quickAddSchema.safeParse({ firstName: 'Maya', lastName: '', gender: 'female', lifeStatus: 'living', birthYear: '62' });
    expect(bad.error?.issues[0]?.message).toBe('Enter the birth year as a four-digit year, like 1962.');
    const ok = quickAddSchema.parse({ firstName: ' Maya ', lastName: '', gender: 'female', lifeStatus: 'living', birthYear: '2000' });
    expect(quickAddToFields(ok)).toEqual({ firstName: 'Maya', lastName: null, gender: 'female', lifeStatus: 'living', birthDate: { year: 2000, month: null, day: null, approximate: false }, isPlaceholder: false });
  });
});

describe('full person form', () => {
  const { people } = buildSeedTree();

  it('round-trips a full person through form values without changing anything', () => {
    for (const person of [people.ravi, people.hari, people.radhaParent]) {
      const values = personFormSchema.parse(personToFormValues(person));
      expect(changedFields(person, formValuesToFields(values, { includePlanning: true }))).toEqual({});
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
    expect(formValuesToFields(values, { includePlanning: false })).toMatchObject({ firstName: 'Kala', isPlaceholder: false });
    expect(issues(personToFormValues(people.radhaParent))).toEqual({});
  });

  it('only reports changed fields, and leaves planning out for editors', () => {
    const values = personFormSchema.parse({ ...personToFormValues(people.ravi), nickname: 'Rav', overallObjective: 'x' });
    expect(changedFields(people.ravi, formValuesToFields(values, { includePlanning: false }))).toEqual({ nickname: 'Rav' });
    expect(Object.keys(changedFields(people.ravi, formValuesToFields(values, { includePlanning: true }))).sort()).toEqual(['nickname', 'planning']);
  });
});
