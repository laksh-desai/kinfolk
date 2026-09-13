import { ICONS } from './icons';

/** Rendered once at the app root. <Icon> references these symbols. */
export function IconSprite() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        {Object.entries(ICONS).map(([name, markup]) => (
          <symbol key={name} id={`kf-icon-${name}`} viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: markup }} />
        ))}
      </defs>
    </svg>
  );
}
