import { Prisma, type PrismaClient } from '@prisma/client';
import { applyChangeSet, GraphValidationError } from '@kinfolk/shared/graph/applyChangeSet';
import type { ChangeOp, ChangeSetResult } from '@kinfolk/shared/schemas/changeSet';
import type { TreeGraph } from '@kinfolk/shared/schemas/graph';
import type { ParentChild } from '@kinfolk/shared/schemas/parentChild';
import type { Person } from '@kinfolk/shared/schemas/person';
import type { TreeRole } from '@kinfolk/shared/schemas/tree';
import type { Union } from '@kinfolk/shared/schemas/union';
import { randomUUID } from 'node:crypto';
import type { AppDeps } from '../../lib/deps';
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors';
import {
  parentChildCreateData,
  parentChildFromRow,
  parentChildUpdateData,
  personCreateData,
  personFromRow,
  personUpdateData,
  unionCreateData,
  unionFromRow,
  unionUpdateData,
} from '../../lib/graphRows';

type Db = PrismaClient | Prisma.TransactionClient;

export async function loadGraph(db: Db, treeId: string, focusPersonId: string | null): Promise<TreeGraph> {
  const [people, unions, parentChildren] = await Promise.all([
    db.person.findMany({ where: { treeId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    db.union.findMany({ where: { treeId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    db.parentChild.findMany({ where: { treeId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
  ]);
  return {
    people: people.map(personFromRow),
    unions: unions.map(unionFromRow),
    parentChildren: parentChildren.map(parentChildFromRow),
    focusPersonId,
  };
}

export class TreeLockedError extends AppError {
  constructor() {
    super(
      409,
      'tree_in_review',
      'This tree is with your reviewer, so editing is paused. Withdraw it from review to make changes.',
    );
  }
}

interface AuditDraft {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
}

function auditJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined ? Prisma.DbNull : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
}

/**
 * Commits a ChangeSet: authorise → lock the tree row → load → pure apply (all invariants) →
 * persist → one AuditEvent per op → bump version. All inside one transaction, so a failure
 * anywhere leaves the tree exactly as it was.
 */
export async function commitChangeSet(
  deps: Pick<AppDeps, 'prisma' | 'now'>,
  input: { treeId: string; actorId: string; role: TreeRole; ops: ChangeOp[]; description?: string },
): Promise<ChangeSetResult> {
  const { treeId, actorId, role } = input;
  if (role !== 'owner' && role !== 'editor') throw new ForbiddenError('You can view this family tree but not change it.');
  assertClientSettableFields(treeId, input.ops);

  return deps.prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Tree" WHERE id = ${treeId}::uuid FOR UPDATE`;
      const tree = await tx.tree.findUnique({ where: { id: treeId } });
      if (!tree) throw new NotFoundError("This family tree was deleted while you were editing it.", 'tree_not_found');
      if (tree.status === 'in_review') throw new TreeLockedError();

      const before = await loadGraph(tx, treeId, tree.focusPersonId);
      const ops = await restoreHiddenFields(tx, treeId, input.ops);

      let result: ReturnType<typeof applyChangeSet>;
      try {
        result = applyChangeSet(before, ops, { now: deps.now().toISOString() });
      } catch (error) {
        if (error instanceof GraphValidationError) {
          throw new ValidationError(error.message, error.field ? { [error.field]: error.message } : undefined);
        }
        throw error;
      }

      const people = new Map(before.people.map((person) => [person.id, person]));
      const unions = new Map(before.unions.map((union) => [union.id, union]));
      const edges = new Map(before.parentChildren.map((edge) => [edge.id, edge]));
      const audits: AuditDraft[] = [];
      const deleteAuditIds = new Map<string, string>();

      try {
        for (const op of result.applied) {
          const auditId = randomUUID();
          switch (op.op) {
            case 'person.create': {
              const person = op.person as Person;
              await tx.person.create({ data: personCreateData(treeId, person) });
              audits.push({ id: auditId, action: op.op, targetType: 'person', targetId: person.id, before: null, after: person });
              people.set(person.id, person);
              break;
            }
            case 'person.update': {
              const previous = people.get(op.id);
              await tx.person.updateMany({ where: { id: op.id, treeId }, data: personUpdateData(op.patch) });
              const next = { ...previous, ...op.patch } as Person;
              audits.push({ id: auditId, action: op.op, targetType: 'person', targetId: op.id, before: previous, after: next });
              people.set(op.id, next);
              break;
            }
            case 'person.delete': {
              const previous = people.get(op.id);
              await tx.person.deleteMany({ where: { id: op.id, treeId } });
              audits.push({ id: auditId, action: op.op, targetType: 'person', targetId: op.id, before: previous, after: null });
              deleteAuditIds.set(op.id, auditId);
              people.delete(op.id);
              break;
            }
            case 'union.create': {
              const union = op.union as Union;
              await tx.union.create({ data: unionCreateData(treeId, union) });
              audits.push({ id: auditId, action: op.op, targetType: 'union', targetId: union.id, before: null, after: union });
              unions.set(union.id, union);
              break;
            }
            case 'union.update': {
              const previous = unions.get(op.id);
              await tx.union.updateMany({ where: { id: op.id, treeId }, data: unionUpdateData(op.patch) });
              const next = { ...previous, ...op.patch } as Union;
              audits.push({ id: auditId, action: op.op, targetType: 'union', targetId: op.id, before: previous, after: next });
              unions.set(op.id, next);
              break;
            }
            case 'union.delete': {
              await tx.union.deleteMany({ where: { id: op.id, treeId } });
              audits.push({ id: auditId, action: op.op, targetType: 'union', targetId: op.id, before: unions.get(op.id), after: null });
              unions.delete(op.id);
              break;
            }
            case 'parentChild.create': {
              const edge = op.edge as ParentChild;
              await tx.parentChild.create({ data: parentChildCreateData(treeId, edge) });
              audits.push({ id: auditId, action: op.op, targetType: 'parentChild', targetId: edge.id, before: null, after: edge });
              edges.set(edge.id, edge);
              break;
            }
            case 'parentChild.update': {
              const previous = edges.get(op.id);
              await tx.parentChild.updateMany({ where: { id: op.id, treeId }, data: parentChildUpdateData(op.patch) });
              const next = { ...previous, ...op.patch } as ParentChild;
              audits.push({ id: auditId, action: op.op, targetType: 'parentChild', targetId: op.id, before: previous, after: next });
              edges.set(op.id, next);
              break;
            }
            case 'parentChild.delete': {
              await tx.parentChild.deleteMany({ where: { id: op.id, treeId } });
              audits.push({ id: auditId, action: op.op, targetType: 'parentChild', targetId: op.id, before: edges.get(op.id), after: null });
              edges.delete(op.id);
              break;
            }
            case 'tree.setFocus': {
              audits.push({ id: auditId, action: op.op, targetType: 'tree', targetId: treeId, before: { focusPersonId: tree.focusPersonId }, after: { focusPersonId: op.personId } });
              break;
            }
          }
        }
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictError('Some of these records already exist. Refresh the page and try again.', 'id_conflict');
        }
        throw error;
      }

      // Editing an approved tree reopens it as a draft (QUESTIONS Q21).
      const nextStatus = tree.status === 'approved' ? 'draft' : tree.status;
      const updated = await tx.tree.update({
        where: { id: treeId },
        data: { version: { increment: 1 }, focusPersonId: result.graph.focusPersonId, status: nextStatus },
      });
      if (nextStatus !== tree.status) {
        audits.push({ id: randomUUID(), action: 'tree.status', targetType: 'tree', targetId: treeId, before: { status: tree.status }, after: { status: nextStatus } });
      }
      await tx.auditEvent.createMany({
        data: audits.map((audit) => ({
          id: audit.id,
          treeId,
          actorId,
          action: audit.action,
          targetType: audit.targetType,
          targetId: audit.targetId,
          before: auditJson(audit.before),
          after: auditJson(audit.after),
        })),
      });

      return {
        version: updated.version,
        treeStatus: updated.status,
        inverse: finalizeInverse(result.inverse, deleteAuditIds),
      };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

/**
 * Undoing a delete must bring back linkedTreeId, which is server-managed and can't be set by a
 * client. Every restoring create carries a token naming the audit event that recorded the
 * deletion, and the server restores that field from the record on replay.
 */
function finalizeInverse(inverse: ChangeOp[], deleteAuditIds: Map<string, string>): ChangeOp[] {
  return inverse.map((op) => {
    if (op.op !== 'person.create') return op;
    const restoreToken = deleteAuditIds.get(op.person.id);
    return restoreToken ? { op: 'person.create', person: op.person, restoreToken } : op;
  });
}

export class ServerManagedFieldError extends AppError {
  constructor(message: string, field: string) {
    super(400, 'server_managed_field', message, { [field]: message });
  }
}

const LINK_MESSAGE = 'Linking to another family tree happens through a link request, not by editing a person.';
const PHOTO_MESSAGE = 'That photo isn’t stored with this family tree. Upload the photo again.';

/**
 * Fields a client may not set freely:
 * - linkedTreeId changes only through an approved link request (SPEC §5.5);
 * - photoUrl must name a file stored under this tree.
 */
function assertClientSettableFields(treeId: string, ops: ChangeOp[]): void {
  const photoPattern = new RegExp(`^/api/files/trees/${treeId}/people/[0-9a-f-]{36}/[a-z0-9-]+\\.webp$`);
  for (const op of ops) {
    if (op.op === 'person.update') {
      if (op.patch.linkedTreeId !== undefined) throw new ServerManagedFieldError(LINK_MESSAGE, 'linkedTreeId');
      if (op.patch.photoUrl != null && !photoPattern.test(op.patch.photoUrl)) throw new ServerManagedFieldError(PHOTO_MESSAGE, 'photoUrl');
    }
    if (op.op === 'person.create') {
      if (op.person.linkedTreeId != null && !op.restoreToken) throw new ServerManagedFieldError(LINK_MESSAGE, 'linkedTreeId');
      if (op.person.photoUrl != null && !photoPattern.test(op.person.photoUrl)) throw new ServerManagedFieldError(PHOTO_MESSAGE, 'photoUrl');
    }
  }
}

async function restoreHiddenFields(tx: Prisma.TransactionClient, treeId: string, ops: ChangeOp[]): Promise<ChangeOp[]> {
  const tokens = ops.flatMap((op) => (op.op === 'person.create' && op.restoreToken ? [op.restoreToken] : []));
  const events = tokens.length
    ? await tx.auditEvent.findMany({ where: { id: { in: tokens }, treeId, action: 'person.delete' } })
    : [];
  const byId = new Map(events.map((event) => [event.id, event]));
  return ops.map((op) => {
    if (op.op !== 'person.create') return op;
    const { restoreToken, ...rest } = op;
    const event = restoreToken ? byId.get(restoreToken) : undefined;
    if (!event || event.targetId !== op.person.id) {
      // No verified record of this person being deleted here: nothing server-managed comes back.
      return { ...rest, person: { ...op.person, linkedTreeId: null } };
    }
    const before = (event.before ?? {}) as { linkedTreeId?: string | null };
    return { ...rest, person: { ...op.person, linkedTreeId: before.linkedTreeId ?? null } };
  });
}
