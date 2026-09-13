import { cx } from '../lib/cx';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Avatars are decorative when a visible name sits beside them. */
  decorative?: boolean;
}

const SIZES = { sm: 'size-8 text-sm', md: 'size-11 text-base', lg: 'size-20 text-2xl' };

export function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export function Avatar({ name, src, size = 'md', className, decorative = true }: AvatarProps) {
  const classes = cx('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft font-semibold text-accent', SIZES[size], className);
  if (src) {
    return <img src={src} alt={decorative ? '' : name} className={cx(classes, 'object-cover')} />;
  }
  return (
    <span className={classes} aria-hidden={decorative || undefined} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : name}>
      {monogram(name)}
    </span>
  );
}
