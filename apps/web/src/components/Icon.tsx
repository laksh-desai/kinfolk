import type { IconName } from './icons';

interface IconProps {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}

/** Decorative by design: the control that contains it must carry the accessible name. */
export function Icon({ name, className = 'size-5', strokeWidth = 2 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <use href={`#kf-icon-${name}`} />
    </svg>
  );
}
