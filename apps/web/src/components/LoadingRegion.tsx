import type { ReactNode } from 'react';

/** Wraps skeletons with a screen-reader status so assistive tech knows content is on its way. */
export function LoadingRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
