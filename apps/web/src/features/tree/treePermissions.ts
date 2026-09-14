import type { TreeDto } from '@kinfolk/shared/schemas/tree';

/**
 * What the current user may do in this tree, for deciding what to render. The API enforces the
 * same rules on every request; this only keeps affordances the user can't use off the screen.
 */
export function canEditTree(tree: Pick<TreeDto, 'role' | 'status'>): boolean {
  return (tree.role === 'owner' || tree.role === 'editor') && tree.status !== 'in_review';
}

/** Planning answers are for the owner and reviewer only (SPEC §5.4, QUESTIONS Q9). */
export function canSeePlanning(tree: Pick<TreeDto, 'role'>): boolean {
  return tree.role === 'owner' || tree.role === 'reviewer';
}

/** Why editing is unavailable, in words — for routes someone reached by URL. */
export function readOnlyReason(tree: Pick<TreeDto, 'role' | 'status'>): string {
  if (tree.status === 'in_review' && (tree.role === 'owner' || tree.role === 'editor')) {
    return 'This family tree is with a reviewer, so editing is paused and they see a stable record. Withdraw it from review to make changes.';
  }
  return 'You can view this family tree but not change it. Ask the owner for edit access if you need to make changes.';
}

export function newId(): string {
  return crypto.randomUUID();
}
