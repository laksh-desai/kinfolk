import { z } from 'zod';

export const TREE_STATUSES = ['draft', 'in_review', 'approved', 'changes_requested'] as const;
export type TreeStatus = (typeof TREE_STATUSES)[number];

export const TREE_ROLES = ['owner', 'editor', 'viewer', 'reviewer'] as const;
export type TreeRole = (typeof TREE_ROLES)[number];

export const createTreeSchema = z.object({
  name: z
    .string({ required_error: 'Give the tree a name.' })
    .trim()
    .min(1, 'Give the tree a name.')
    .max(120, 'Use 120 characters or fewer for the name.'),
  description: z
    .string()
    .trim()
    .max(1000, 'Use 1000 characters or fewer for the description.')
    .optional()
    .transform((value) => (value ? value : null)),
});
export type CreateTreeInput = z.input<typeof createTreeSchema>;

export const updateTreeSchema = createTreeSchema.partial();
export type UpdateTreeInput = z.input<typeof updateTreeSchema>;

export const deleteTreeSchema = z.object({
  confirmName: z.string({ required_error: 'Type the tree’s name to confirm.' }).min(1, 'Type the tree’s name to confirm.'),
});

export interface TreeDto {
  id: string;
  name: string;
  description: string | null;
  status: TreeStatus;
  focusPersonId: string | null;
  version: number;
  role: TreeRole;
  owner: { id: string; name: string };
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TreeSummaryDto extends TreeDto {
  peopleCount: number;
}
