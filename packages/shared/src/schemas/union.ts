import { z } from 'zod';
import { partialDateSchema, type PartialDate } from './dates';
import { uuidSchema } from './person';

export const UNION_TYPES = ['marriage', 'partnership', 'unknown'] as const;
export const UNION_STATUSES = ['current', 'divorced', 'separated', 'widowed', 'ended'] as const;
export type UnionType = (typeof UNION_TYPES)[number];
export type UnionStatus = (typeof UNION_STATUSES)[number];

/** Unions whose connector is drawn dashed and whose labels say "Former". */
export const ENDED_UNION_STATUSES: ReadonlySet<UnionStatus> = new Set(['divorced', 'separated', 'ended']);

export interface UnionFields {
  partnerAId: string;
  /** Null for a single-parent union. */
  partnerBId: string | null;
  type: UnionType;
  status: UnionStatus;
  startDate: PartialDate | null;
  endDate: PartialDate | null;
}

export interface Union extends UnionFields {
  id: string;
  createdAt: string;
}

const unionFieldsShape = {
  partnerAId: uuidSchema,
  partnerBId: uuidSchema.nullable().optional().transform((value) => value ?? null),
  type: z.enum(UNION_TYPES, { errorMap: () => ({ message: 'Choose marriage, partnership, or unknown.' }) }),
  status: z.enum(UNION_STATUSES, { errorMap: () => ({ message: 'Choose a status for this relationship.' }) }),
  startDate: partialDateSchema.nullable().optional().transform((value) => value ?? null),
  endDate: partialDateSchema.nullable().optional().transform((value) => value ?? null),
};

export const unionCreateSchema = z.object({
  id: uuidSchema,
  createdAt: z.string().datetime().optional(),
  ...unionFieldsShape,
});

export const unionPatchSchema = z
  .object({
    partnerAId: unionFieldsShape.partnerAId.optional(),
    partnerBId: unionFieldsShape.partnerBId.optional(),
    type: unionFieldsShape.type.optional(),
    status: unionFieldsShape.status.optional(),
    startDate: unionFieldsShape.startDate.optional(),
    endDate: unionFieldsShape.endDate.optional(),
  })
  .strict();
export type UnionPatch = Partial<UnionFields>;
