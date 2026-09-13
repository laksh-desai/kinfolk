import type { LayoutBranch } from '@kinfolk/shared/layout/layoutTypes';
import { memo } from 'react';

interface BranchBracketsProps {
  branches: readonly LayoutBranch[];
  marriedIn: ReadonlySet<string>;
  labelFor: (branch: LayoutBranch) => string;
}

/**
 * The subtle blood-line vs married-in distinction (SPEC §4.3): a thin bracket and a small
 * label above each branch that has no blood relative of the focus person. Toggleable; never
 * recolours cards.
 */
export const BranchBrackets = memo(function BranchBrackets({ branches, marriedIn, labelFor }: BranchBracketsProps) {
  return (
    <div className="pointer-events-none absolute left-0 top-0">
      {branches
        .filter((branch) => marriedIn.has(branch.id))
        .map((branch) => (
          <div
            key={branch.id}
            className="absolute"
            style={{ transform: `translate(${branch.bounds.x - 12}px, ${branch.bounds.y - 44}px)`, width: branch.bounds.width + 24 }}
          >
            <div className="flex items-center gap-2 text-sm font-medium text-ink-muted">
              <span className="whitespace-nowrap rounded-full bg-branch-tint px-2 py-0.5">{labelFor(branch)}</span>
            </div>
            <div aria-hidden="true" className="mt-1 h-2.5 rounded-t-md border-x-2 border-t-2 border-line-strong/60" />
          </div>
        ))}
    </div>
  );
});
