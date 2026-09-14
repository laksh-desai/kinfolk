import type { LayoutResult, LineStyle } from '@kinfolk/shared/layout/layoutTypes';
import { memo } from 'react';
import { roundedPath } from './roundedPath';

const DASH: Record<LineStyle, string | undefined> = {
  solid: undefined,
  dashed: '8 6',
  dotted: '2 5',
};

interface EdgeLayerProps {
  layout: LayoutResult;
  /** Consecutive people on a Compare path, as "a|b" in both orders; their connectors are emphasised. */
  highlightPairs?: ReadonlySet<string>;
}

/** All connectors in one SVG under the cards. Decorative for assistive tech — relationships are in each card's name and the panel. */
export const EdgeLayer = memo(function EdgeLayer({ layout, highlightPairs }: EdgeLayerProps) {
  const { width, height } = layout.bounds;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={Math.max(width, 1)}
      height={Math.max(height, 1)}
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      fill="none"
    >
      {layout.unions.map((union) => {
        const [a, b] = union.partnerIds;
        const active = Boolean(a && b && highlightPairs?.has(`${a}|${b}`));
        return union.path.length > 1 ? (
          <path
            key={union.unionId}
            d={roundedPath(union.path)}
            stroke={active ? 'var(--kf-accent)' : 'var(--kf-edge)'}
            strokeWidth={active ? 4 : 2.5}
            strokeDasharray={DASH[union.style]}
            strokeLinecap="round"
          />
        ) : null;
      })}
      {layout.edges.map((edge) => {
        const active = Boolean(
          highlightPairs &&
            (layout.unions.find((union) => union.unionId === edge.unionId)?.partnerIds ?? []).some((parentId) => highlightPairs.has(`${parentId}|${edge.childId}`)),
        );
        return (
          <path
            key={edge.parentChildId}
            d={roundedPath(edge.path)}
            stroke={active ? 'var(--kf-accent)' : 'var(--kf-edge)'}
            strokeWidth={active ? 4 : 2}
            strokeDasharray={DASH[edge.style]}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
});
