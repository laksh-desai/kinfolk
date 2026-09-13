import { z } from 'zod';
import { uuidSchema } from './person';

export const PARENT_CHILD_KINDS = ['biological', 'adopted', 'step', 'foster', 'guardian'] as const;
export type ParentChildKind = (typeof PARENT_CHILD_KINDS)[number];

/** Kinds that carry lineage to grandparents, cousins, and so on (QUESTIONS Q4). */
export const LINEAL_KINDS: ReadonlySet<ParentChildKind> = new Set(['biological', 'adopted']);

export interface ParentChild {
  id: string;
  unionId: string;
  childId: string;
  kind: ParentChildKind;
  createdAt: string;
}

export const parentChildCreateSchema = z.object({
  id: uuidSchema,
  unionId: uuidSchema,
  childId: uuidSchema,
  kind: z.enum(PARENT_CHILD_KINDS, { errorMap: () => ({ message: 'Choose how this child is related.' }) }),
  createdAt: z.string().datetime().optional(),
});

export const parentChildPatchSchema = z
  .object({
    unionId: uuidSchema.optional(),
    kind: parentChildCreateSchema.shape.kind.optional(),
  })
  .strict();
export type ParentChildPatch = Partial<Pick<ParentChild, 'unionId' | 'kind'>>;
