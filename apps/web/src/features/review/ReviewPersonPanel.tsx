import { ageLabel, formatPartialDate, lifespanLabel, toCalendarDay } from '@kinfolk/shared/dates/partialDate';
import type { Person } from '@kinfolk/shared/schemas/person';

/** The detail a reviewer needs on one person. */
export function ReviewPersonPanel({ person, name, relation }: { person: Person; name: string; relation: string | null }) {
  const facts: Array<[string, string]> = [
    ['Relationship', relation ?? '—'],
    ['Born', person.birthDate ? formatPartialDate(person.birthDate, 'long') : 'Not recorded'],
    ...(person.lifeStatus === 'deceased' ? ([['Died', person.deathDate ? formatPartialDate(person.deathDate, 'long') : 'Date not recorded']] as Array<[string, string]>) : []),
    ...(ageLabel(person, toCalendarDay(new Date())) ? ([['Age', ageLabel(person, toCalendarDay(new Date())) as string]] as Array<[string, string]>) : []),
    ...(person.email ? ([['Email', person.email]] as Array<[string, string]>) : []),
    ...(person.phone ? ([['Phone', person.phone]] as Array<[string, string]>) : []),
    ...(person.address?.formatted ? ([['Address', person.address.formatted]] as Array<[string, string]>) : []),
    ...(person.profession ? ([['Profession', person.profession]] as Array<[string, string]>) : []),
  ];

  return (
    <section aria-labelledby="review-person-heading" className="border-t border-line px-5 py-4">
      <h2 id="review-person-heading" className="text-lg font-semibold">
        {name}
      </h2>
      <p className="text-base text-ink-muted">{lifespanLabel(person)}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-semibold text-ink-muted">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {person.notes ? <p className="mt-2 rounded-control bg-sunken px-3 py-2 text-base">{person.notes}</p> : null}
    </section>
  );
}
