import { z } from 'zod';
import { parentChildCreateSchema, parentChildPatchSchema, type ParentChild, type ParentChildPatch } from './parentChild';
import { personCreateSchema, personPatchSchema, uuidSchema, type Person, type PersonPatch } from './person';
import { unionCreateSchema, unionPatchSchema, type Union, type UnionPatch } from './union';

export type PersonCreateInput = Omit<Person, 'createdAt'> & { createdAt?: string };
export type UnionCreateInput = Omit<Union, 'createdAt'> & { createdAt?: string };
export type ParentChildCreateInput = Omit<ParentChild, 'createdAt'> & { createdAt?: string };

export type ChangeOp =
  /** restoreToken: set by the server on the inverse of a delete so server-managed fields come back on undo. */
  | { op: 'person.create'; person: PersonCreateInput; restoreToken?: string }
  | { op: 'person.update'; id: string; patch: PersonPatch }
  | { op: 'person.delete'; id: string }
  | { op: 'union.create'; union: UnionCreateInput }
  | { op: 'union.update'; id: string; patch: UnionPatch }
  | { op: 'union.delete'; id: string }
  | { op: 'parentChild.create'; edge: ParentChildCreateInput }
  | { op: 'parentChild.update'; id: string; patch: ParentChildPatch }
  | { op: 'parentChild.delete'; id: string }
  | { op: 'tree.setFocus'; personId: string | null };

export const MAX_OPS_PER_CHANGESET = 6000;

export const changeOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('person.create'), person: personCreateSchema, restoreToken: z.string().max(100).optional() }),
  z.object({ op: z.literal('person.update'), id: uuidSchema, patch: personPatchSchema }),
  z.object({ op: z.literal('person.delete'), id: uuidSchema }),
  z.object({ op: z.literal('union.create'), union: unionCreateSchema }),
  z.object({ op: z.literal('union.update'), id: uuidSchema, patch: unionPatchSchema }),
  z.object({ op: z.literal('union.delete'), id: uuidSchema }),
  z.object({ op: z.literal('parentChild.create'), edge: parentChildCreateSchema }),
  z.object({ op: z.literal('parentChild.update'), id: uuidSchema, patch: parentChildPatchSchema }),
  z.object({ op: z.literal('parentChild.delete'), id: uuidSchema }),
  z.object({ op: z.literal('tree.setFocus'), personId: uuidSchema.nullable() }),
]);

export const changeSetSchema = z.object({
  ops: z
    .array(changeOpSchema)
    .min(1, 'There were no changes to save.')
    .max(MAX_OPS_PER_CHANGESET, `Save at most ${MAX_OPS_PER_CHANGESET} changes at once.`),
  /** Plain-language summary for the audit log, e.g. "Added Maya as Ravi's cousin". */
  description: z.string().trim().max(300).optional(),
});
export type ChangeSetInput = z.input<typeof changeSetSchema>;

export interface ChangeSetResult {
  version: number;
  inverse: ChangeOp[];
  treeStatus: string;
}
