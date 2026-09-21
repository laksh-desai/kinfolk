import { directRelatives } from '@kinfolk/shared/relatives/directRelatives';
import type { Person } from '@kinfolk/shared/schemas/person';
import { changedFields, formValuesToFields, personFormSchema, personToFormValues } from '@kinfolk/shared/schemas/personForm';
import { useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, buttonClasses } from '../../../components/Button';
import { CheckboxField } from '../../../components/CheckboxField';
import { FormAlert } from '../../../components/FormAlert';
import { Icon } from '../../../components/Icon';
import { SelectField } from '../../../components/SelectField';
import { TextAreaField } from '../../../components/TextAreaField';
import { TextField } from '../../../components/TextField';
import { announce } from '../../../lib/announcer';
import { useForm } from '../../../lib/useForm';
import { commitWithUndo } from '../editing/changeQueue';
import { useTreeOutlet } from '../treeOutlet';
import { AddressFields } from './AddressFields';
import { DateFields } from './DateFields';
import { FormSection } from './FormSection';
import { PanelShell } from './PanelShell';
import { PersonPhotoField } from './PersonPhotoField';
import { PersonRecordField } from './PersonRecordField';
import { GENDER_OPTIONS, LIFE_STATUS_OPTIONS } from './QuickAddFields';
import { RelativesSummary } from './RelativesSummary';
import { UnsavedChangesGuard } from './UnsavedChangesGuard';

export const PERSON_FORM_LABELS: Record<string, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  maidenName: 'Maiden name',
  nickname: 'Nickname',
  suffix: 'Suffix',
  gender: 'Gender',
  lifeStatus: 'Living or deceased',
  birthDay: 'Birth day',
  birthMonth: 'Birth month',
  birthYear: 'Birth year',
  deathDay: 'Death day',
  deathMonth: 'Death month',
  deathYear: 'Death year',
  birthPlace: 'Birthplace',
  maritalStatus: 'Marital status',
  email: 'Email',
  phone: 'Phone',
  addressFormatted: 'Address',
  addressStreet: 'Street',
  addressCity: 'City or town',
  addressState: 'State or region',
  addressPostalCode: 'Postal code',
  addressCountry: 'Country',
  profession: 'Profession',
  hobbies: 'Hobbies',
  favoriteDestination: 'Favorite destination',
  favoriteFood: 'Favorite food',
  favoriteMusic: 'Favorite music',
  specialNeeds: 'Special needs',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  notes: 'Notes',
  overallObjective: 'Overall objective',
  areasOfConcern: 'Areas of concern',
  marketOutlook: 'Market outlook',
  familyRelationships: 'Family relationships',
  rateOfReturnView: 'Rate of return',
};

/** The person form itself; EditPersonRoute renders it once the person and permissions check out. */
export function EditPersonForm({ person }: { person: Person }) {
  const personId = person.id;
  const { view, tree } = useTreeOutlet();
  const navigate = useNavigate();
  const leaving = useRef(false);
  const name = view.names.get(personId) ?? '';
  const relatives = useMemo(() => directRelatives(view.index, view.resolve, personId), [view.index, view.resolve, personId]);
  const panelUrl = `/trees/${tree.id}/people/${personId}`;
  const title = person.firstName ? `Edit ${person.firstName}’s details` : `Edit details for ${name}`;

  const form = useForm({
    schema: personFormSchema,
    initialValues: personToFormValues(person),
    labels: PERSON_FORM_LABELS,
    idPrefix: 'person',
    onSubmit: (values) => {
      const patch = changedFields(person, formValuesToFields(values));
      leaving.current = true;
      if (Object.keys(patch).length === 0) {
        announce('Nothing changed, so there was nothing to save.');
        navigate(panelUrl);
        return;
      }
      const newName = values.firstName.trim() || name;
      void commitWithUndo(tree.id, [{ op: 'person.update', id: personId, patch }], `Edited ${newName}’s details`, `Saved ${newName}’s details.`).catch(() => undefined);
      navigate(panelUrl);
    },
  });
  const values = form.values;
  const showDeath = values.lifeStatus === 'deceased' || Boolean(values.deathYear || values.deathMonth || values.deathDay);

  return (
    <PanelShell
      title={title}
      subtitle="Only first name, gender, and living or deceased are needed. Everything else can wait."
      back={{ to: panelUrl, label: `Back to ${name}` }}
      closeTo={panelUrl}
      closeLabel={`Close without saving and return to ${name}`}
      wide
      footer={
        <>
          <Button type="submit" form="person-form" variant="primary" icon="check" pending={form.submitting} pendingLabel="Saving…">
            Save changes
          </Button>
          <Link to={panelUrl} className={buttonClasses('secondary')}>
            Cancel
          </Link>
        </>
      }
    >
      <UnsavedChangesGuard when={form.dirty} bypassRef={leaving} />
      <form id="person-form" noValidate onSubmit={form.handleSubmit}>
        <div className="px-5 pt-4">
          <FormAlert message={form.formError} alertRef={form.formErrorRef} />
        </div>
        <FormSection title="Identity">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              field={form.field('firstName')}
              label="First name"
              required={!values.isPlaceholder}
              autoComplete="off"
              hint={person.isPlaceholder ? 'Naming this placeholder turns them into a regular person.' : undefined}
            />
            <TextField field={form.field('lastName')} label="Last name" optionalMark autoComplete="off" />
            <TextField field={form.field('maidenName')} label="Maiden name" optionalMark autoComplete="off" />
            <TextField field={form.field('nickname')} label="Nickname" optionalMark autoComplete="off" />
            <TextField field={form.field('suffix')} label="Suffix" optionalMark autoComplete="off" hint="Jr., Sr., III" />
            <SelectField field={form.field('gender')} label="Gender" options={GENDER_OPTIONS} required />
            <SelectField field={form.field('lifeStatus')} label="Living or deceased" options={LIFE_STATUS_OPTIONS} required />
            <TextField field={form.field('birthPlace')} label="Birthplace" optionalMark autoComplete="off" />
          </div>
          <DateFields
            prefix="birth"
            legend="Date of birth"
            field={form.field}
            approximate={Boolean(values.birthApproximate)}
            onApproximateChange={(checked) => form.setValue('birthApproximate', checked)}
          />
          {showDeath ? (
            <DateFields
              prefix="death"
              legend="Date of death"
              field={form.field}
              approximate={Boolean(values.deathApproximate)}
              onApproximateChange={(checked) => form.setValue('deathApproximate', checked)}
            />
          ) : null}
          <TextField field={form.field('maritalStatus')} label="Marital status" optionalMark autoComplete="off" hint="In their own words, e.g. “Married”, “Widowed”." />
          {person.isPlaceholder ? (
            <CheckboxField
              id="person-isPlaceholder"
              label="Keep as an unnamed placeholder"
              checked={Boolean(values.isPlaceholder)}
              onChange={(checked) => form.setValue('isPlaceholder', checked)}
              hint="Placeholders connect relatives when you don’t know someone’s name yet."
            />
          ) : null}
          <div className="flex flex-col gap-2">
            <p className="text-base font-semibold">Photo</p>
            <PersonPhotoField treeId={tree.id} person={person} name={name} />
          </div>
        </FormSection>

        <FormSection title="Public records" description="A PDF of this person’s public records, for anyone working on this tree.">
          <PersonRecordField treeId={tree.id} person={person} name={name} />
        </FormSection>

        <FormSection title="Contact">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField field={form.field('email')} label="Email" type="email" optionalMark autoComplete="off" />
            <TextField field={form.field('phone')} label="Phone" type="tel" optionalMark autoComplete="off" />
          </div>
          <AddressFields
            field={form.field}
            onPlace={(address) => {
              form.setValue('addressFormatted', address.formatted);
              form.setValue('addressStreet', address.street);
              form.setValue('addressCity', address.city);
              form.setValue('addressState', address.state);
              form.setValue('addressPostalCode', address.postalCode);
              form.setValue('addressCountry', address.country);
            }}
          />
        </FormSection>

        <FormSection title="Relationships" description="Relationships are changed on their own screen, and each change saves straight away.">
          <div className="-mx-5">
            <RelativesSummary treeId={tree.id} relatives={relatives} names={view.names} />
          </div>
          <Link to={`${panelUrl}/relationships`} className={buttonClasses('secondary', 'self-start')}>
            <Icon name="link" />
            Edit {person.firstName ? `${person.firstName}’s` : 'their'} relationships
          </Link>
        </FormSection>

        <FormSection title="Personal">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField field={form.field('profession')} label="Profession" optionalMark autoComplete="off" className="sm:col-span-2" />
            <TextAreaField field={form.field('hobbies')} label="Hobbies" optionalMark rows={2} className="sm:col-span-2" />
            <TextField field={form.field('favoriteDestination')} label="Favorite destination" optionalMark autoComplete="off" />
            <TextField field={form.field('favoriteFood')} label="Favorite food" optionalMark autoComplete="off" />
            <TextField field={form.field('favoriteMusic')} label="Favorite music" optionalMark autoComplete="off" />
            <TextAreaField field={form.field('specialNeeds')} label="Special needs" optionalMark rows={2} className="sm:col-span-2" />
            <TextField field={form.field('facebook')} label="Facebook" optionalMark autoComplete="off" />
            <TextField field={form.field('linkedin')} label="LinkedIn" optionalMark autoComplete="off" />
            <TextField field={form.field('instagram')} label="Instagram" optionalMark autoComplete="off" />
            <TextField field={form.field('youtube')} label="YouTube" optionalMark autoComplete="off" />
            <TextField field={form.field('tiktok')} label="TikTok" optionalMark autoComplete="off" />
          </div>
          <TextAreaField field={form.field('notes')} label="Notes" optionalMark rows={4} />
        </FormSection>
      </form>
    </PanelShell>
  );
}
