import { cardLabel, type CalendarDay } from '@kinfolk/shared/dates/partialDate';
import type { LayoutNode } from '@kinfolk/shared/layout/layoutTypes';
import type { Person } from '@kinfolk/shared/schemas/person';
import { memo, useId } from 'react';
import { monogram } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { cx } from '../lib/cx';

interface PersonCardProps {
  node: LayoutNode;
  person: Person;
  name: string;
  relation: string | null;
  isFocus: boolean;
  /** In the household the tree is for: the focus person and their current partner (ADR 035). */
  isClient: boolean;
  isSelected: boolean;
  isTabStop: boolean;
  dimmed: boolean;
  /** Today, passed in so every card agrees and tests are deterministic. */
  today: CalendarDay;
  onSelect: (personId: string) => void;
  onToggleCollapsed: (personId: string) => void;
}

const GENDER_MARK: Record<Person['gender'], { glyph: string; label: string } | null> = {
  male: { glyph: '♂', label: 'male' },
  female: { glyph: '♀', label: 'female' },
  other: { glyph: '⚥', label: 'other gender' },
  unknown: null,
};

/**
 * Blue for men, pink for women, the house accent for everyone else. It is an accent on the
 * monogram and the gender glyph, never the whole card: at sixty cards a wash of colour is
 * noise, and colour is never the only way to know — the card's description says it in words.
 */
const GENDER_TINT: Record<Person['gender'], { circle: string; glyph: string }> = {
  male: { circle: 'bg-male-soft text-male', glyph: 'text-male' },
  female: { circle: 'bg-female-soft text-female', glyph: 'text-female' },
  other: { circle: 'bg-accent-soft text-accent', glyph: 'text-ink-muted' },
  unknown: { circle: 'bg-accent-soft text-accent', glyph: 'text-ink-muted' },
};

function placeOf(person: Person): string | null {
  const address = person.address;
  if (address?.city) return [address.city, address.state ?? address.country].filter(Boolean).join(', ');
  return person.birthPlace;
}

/**
 * One person on the canvas. The whole card is a real button: named by the person, described by
 * their dates, place, and relationship. Nothing on it depends on hover.
 */
export const PersonCard = memo(function PersonCard({
  node,
  person,
  name,
  relation,
  isFocus,
  isClient,
  isSelected,
  isTabStop,
  dimmed,
  today,
  onSelect,
  onToggleCollapsed,
}: PersonCardProps) {
  const detailsId = useId();
  const deceased = person.lifeStatus === 'deceased';
  const years = cardLabel(person, today);
  const place = placeOf(person);
  const gender = GENDER_MARK[person.gender];
  const twin = node.multipleBirthId !== null;
  const initials = person.isPlaceholder && !person.firstName ? '?' : monogram(name);

  return (
    <div
      className="absolute"
      style={{ transform: `translate(${node.x}px, ${node.y}px)`, width: node.width, height: node.height, transition: 'transform 220ms ease' }}
    >
      <button
        type="button"
        data-person-id={person.id}
        tabIndex={isTabStop ? 0 : -1}
        aria-label={`${name}${relation ? `, ${relation}` : ''}${isFocus ? ', focus person' : ''}${isClient && !isFocus ? ', client' : ''}`}
        aria-describedby={detailsId}
        aria-current={isSelected ? 'true' : undefined}
        onClick={() => onSelect(person.id)}
        className={cx(
          'group relative flex h-full w-full items-start gap-3 overflow-hidden rounded-card border-2 p-3 text-left shadow-card transition-[opacity,box-shadow] duration-150',
          deceased ? 'bg-sunken' : 'bg-surface',
          person.isPlaceholder ? 'border-dashed border-line-strong' : isSelected || isClient ? 'border-accent' : 'border-line',
          // The client household stands out from sixty relatives without shouting.
          isClient && 'ring-2 ring-accent/45',
          isSelected && 'ring-4 ring-accent/30',
          dimmed && 'opacity-40',
        )}
      >
        {person.photoUrl ? (
          <img src={person.photoUrl} alt="" className={cx('size-12 shrink-0 rounded-full object-cover', deceased && 'grayscale')} />
        ) : (
          <span
            aria-hidden="true"
            className={cx(
              'inline-flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold',
              person.isPlaceholder ? 'border-2 border-dashed border-line-strong text-ink-muted' : GENDER_TINT[person.gender].circle,
              deceased && !person.isPlaceholder && 'opacity-80',
            )}
          >
            {initials}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cx('truncate text-base font-semibold leading-snug', person.isPlaceholder ? 'italic text-ink-muted' : 'text-ink')}>{name}</span>
          <span id={detailsId} className="flex min-w-0 flex-col text-sm leading-snug text-ink-muted">
            {deceased ? <span className="sr-only">Deceased. </span> : null}
            {years ? <span className="truncate">{years}</span> : null}
            {place ? <span className="truncate">{place}</span> : null}
            {relation && !isFocus ? <span className="truncate font-medium text-accent">{relation}</span> : null}
            {gender ? <span className="sr-only">, {gender.label}</span> : null}
            {twin ? <span className="sr-only">, multiple birth</span> : null}
          </span>
        </span>
        <span className="absolute right-2 top-2 flex items-center gap-1" aria-hidden="true">
          {twin ? <span className="rounded-full bg-info-soft px-1.5 text-xs font-semibold text-info">Twin</span> : null}
          {gender ? <span className={cx('text-sm leading-none', GENDER_TINT[person.gender].glyph)}>{gender.glyph}</span> : null}
        </span>
        {isFocus || isClient ? (
          <span
            className={cx(
              'absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
              isFocus ? 'bg-accent text-on-accent' : 'border border-accent text-accent',
            )}
            aria-hidden="true"
          >
            <Icon name={isFocus ? 'target' : 'heart'} className="size-3.5" />
            {isFocus ? 'Focus' : 'Client'}
          </span>
        ) : null}
      </button>
      {node.hiddenCount > 0 ? (
        <button
          type="button"
          tabIndex={isTabStop ? 0 : -1}
          onClick={() => onToggleCollapsed(person.id)}
          aria-label={`Show ${node.hiddenCount} hidden ${node.hiddenCount === 1 ? 'relative' : 'relatives'} of ${name}`}
          className="absolute -bottom-5 left-1/2 inline-flex min-h-8 -translate-x-1/2 items-center gap-1 rounded-full border border-line-strong bg-surface px-3 text-sm font-semibold text-ink shadow-card hover:bg-sunken"
        >
          <Icon name="expand" className="size-4" />+{node.hiddenCount}
        </button>
      ) : null}
    </div>
  );
});
