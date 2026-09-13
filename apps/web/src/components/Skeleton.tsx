import { cx } from '../lib/cx';

/** A shimmering placeholder in the shape of the content that is coming. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('skeleton', className)} />;
}
