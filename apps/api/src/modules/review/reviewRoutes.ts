import {
  changeRequestSchema,
  submitReviewSchema,
  type ChangeRequestDto,
  type ReviewAssignmentDto,
  type ReviewStateDto,
  type ReviewTreeDto,
} from '@kinfolk/shared/schemas/review';
import type { ChangeRequest, ReviewAssignment, Tree, User } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { AppDeps } from '../../lib/deps';
import { ConflictError, ForbiddenError, GoneError, NotFoundError } from '../../lib/errors';
import { mintLinkToken, readLinkToken, userDisplayName } from '../../lib/linkTokens';
import { requireTreeRole } from '../../lib/treeAccess';
import { parseInput } from '../../lib/validate';
import { requireAuth } from '../auth/authenticate';
import { loadGraph } from '../graph/graphService';
import type { InviteRateLimits } from '../access/accessRoutes';

const INVALID_REVIEW = 'This review link isn’t valid. Check that you copied the whole link, or ask for a new one.';

type AssignmentRow = ReviewAssignment & { reviewer?: Pick<User, 'firstName' | 'lastName'> | null; createdBy?: Pick<User, 'firstName' | 'lastName'> | null };

function toAssignmentDto(assignment: AssignmentRow): ReviewAssignmentDto {
  return {
    id: assignment.id,
    reviewerEmail: assignment.reviewerEmail,
    reviewerName: userDisplayName(assignment.reviewer),
    note: assignment.note,
    sentBy: userDisplayName(assignment.createdBy),
    sentAt: assignment.createdAt.toISOString(),
    decision: assignment.decision === 'approved' || assignment.decision === 'changes_requested' ? assignment.decision : null,
    decidedAt: assignment.decidedAt?.toISOString() ?? null,
  };
}

function toChangeRequestDto(request: ChangeRequest & { author?: Pick<User, 'firstName' | 'lastName'> | null }): ChangeRequestDto {
  return {
    id: request.id,
    body: request.body,
    status: request.status,
    author: userDisplayName(request.author),
    createdAt: request.createdAt.toISOString(),
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
  };
}

/**
 * The review workflow (SPEC §5.7). Submitting locks the tree (QUESTIONS Q21, enforced in
 * commitChangeSet); the reviewer works from a signed link and their decision moves the status.
 */
export async function reviewRoutes(app: FastifyInstance, opts: { deps: AppDeps; rateLimit: InviteRateLimits }) {
  const { deps } = opts;
  const people = { reviewer: { select: { firstName: true, lastName: true } }, createdBy: { select: { firstName: true, lastName: true } } } as const;

  const openAssignment = (treeId: string) => deps.prisma.reviewAssignment.findFirst({ where: { treeId, revokedAt: null }, include: people, orderBy: { createdAt: 'desc' } });

  const changeRequestsFor = async (treeId: string) =>
    (await deps.prisma.changeRequest.findMany({ where: { treeId }, include: { author: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' } })).map(toChangeRequestDto);

  async function notifyOwner(tree: Tree, subject: string, lines: string[]) {
    const owner = await deps.prisma.user.findUnique({ where: { id: tree.ownerId }, select: { email: true } });
    if (owner) await deps.mailer.send({ to: owner.email, subject, text: [...lines, '', `${deps.env.WEB_URL}/trees/${tree.id}`].join('\n') });
  }

  app.get('/api/trees/:treeId/review', async (request): Promise<ReviewStateDto> => {
    const { treeId } = request.params as { treeId: string };
    const { tree } = await requireTreeRole(deps, request, treeId, ['owner', 'editor', 'viewer', 'reviewer']);
    const assignment = await openAssignment(tree.id);
    return { status: tree.status, assignment: assignment ? toAssignmentDto(assignment) : null, changeRequests: await changeRequestsFor(tree.id) };
  });

  app.post('/api/trees/:treeId/review', { config: { rateLimit: opts.rateLimit } }, async (request, reply) => {
    const { treeId } = request.params as { treeId: string };
    const { tree, user } = await requireTreeRole(deps, request, treeId, ['owner'], 'Only the tree owner can send it for review.');
    const input = parseInput(submitReviewSchema, request.body);
    if (tree.status === 'in_review') throw new ConflictError('This tree is already with a reviewer. Withdraw it first if you want to send it to someone else.', 'already_in_review');
    const now = deps.now();
    const id = randomUUID();
    const { token, tokenHash } = mintLinkToken(deps.env.SESSION_SECRET, 'review', id, null, now);
    const assignment = await deps.prisma.$transaction(async (tx) => {
      await tx.reviewAssignment.updateMany({ where: { treeId: tree.id, revokedAt: null }, data: { revokedAt: now } });
      const created = await tx.reviewAssignment.create({
        data: { id, treeId: tree.id, tokenHash, reviewerEmail: input.reviewerEmail, note: input.note, createdById: user.id, createdAt: now },
        include: people,
      });
      await tx.tree.update({ where: { id: tree.id }, data: { status: 'in_review' } });
      await tx.auditEvent.create({
        data: { treeId: tree.id, actorId: user.id, action: 'review.submit', targetType: 'tree', targetId: tree.id, before: { status: tree.status }, after: { status: 'in_review', reviewerEmail: input.reviewerEmail } },
      });
      return created;
    });
    const sender = userDisplayName(user) ?? user.email;
    await deps.mailer.send({
      to: input.reviewerEmail,
      subject: `${sender} asked you to review the family tree “${tree.name}”`,
      text: [
        `${sender} has sent you the family tree “${tree.name}” to review on Kinfolk.`,
        ...(input.note ? ['', `Their note: ${input.note}`] : []),
        '',
        'Open it here — you can approve it or ask for changes:',
        `${deps.env.WEB_URL}/review/${token}`,
        '',
        'You’ll need to sign in or create an account; the first person to open this link keeps it.',
      ].join('\n'),
    });
    return reply.code(201).send({ review: toAssignmentDto(assignment) });
  });

  app.delete('/api/trees/:treeId/review', async (request, reply) => {
    const { treeId } = request.params as { treeId: string };
    const { tree, user } = await requireTreeRole(deps, request, treeId, ['owner'], 'Only the tree owner can withdraw a review.');
    const assignment = await openAssignment(tree.id);
    if (!assignment) throw new NotFoundError('This tree isn’t with a reviewer.');
    const now = deps.now();
    await deps.prisma.$transaction([
      deps.prisma.reviewAssignment.update({ where: { id: assignment.id }, data: { revokedAt: now } }),
      deps.prisma.tree.update({ where: { id: tree.id }, data: { status: 'draft' } }),
      deps.prisma.auditEvent.create({
        data: { treeId: tree.id, actorId: user.id, action: 'review.withdraw', targetType: 'tree', targetId: tree.id, before: { status: tree.status }, after: { status: 'draft' } },
      }),
    ]);
    return reply.code(204).send();
  });

  app.post('/api/trees/:treeId/review/resubmit', { config: { rateLimit: opts.rateLimit } }, async (request) => {
    const { treeId } = request.params as { treeId: string };
    const { tree, user } = await requireTreeRole(deps, request, treeId, ['owner'], 'Only the tree owner can resubmit a review.');
    const assignment = await openAssignment(tree.id);
    if (!assignment) throw new NotFoundError('There’s no reviewer to send this back to. Send it for review again.');
    if (tree.status === 'in_review') throw new ConflictError('This tree is already with your reviewer.', 'already_in_review');
    const updated = await deps.prisma.$transaction(async (tx) => {
      const next = await tx.reviewAssignment.update({ where: { id: assignment.id }, data: { decision: null, decidedAt: null }, include: people });
      await tx.tree.update({ where: { id: tree.id }, data: { status: 'in_review' } });
      await tx.auditEvent.create({
        data: { treeId: tree.id, actorId: user.id, action: 'review.resubmit', targetType: 'tree', targetId: tree.id, before: { status: tree.status }, after: { status: 'in_review' } },
      });
      return next;
    });
    await deps.mailer.send({
      to: assignment.reviewerEmail,
      subject: `“${tree.name}” is ready for another look`,
      text: [`${userDisplayName(user) ?? 'The owner'} has answered your notes on “${tree.name}” and sent it back for review.`, '', 'Your review link still works:', `${deps.env.WEB_URL}/trees/${tree.id}`].join('\n'),
    });
    return { review: toAssignmentDto(updated) };
  });

  app.post('/api/trees/:treeId/change-requests/:requestId/resolve', async (request, reply) => {
    const { treeId, requestId } = request.params as { treeId: string; requestId: string };
    const { tree, user } = await requireTreeRole(deps, request, treeId, ['owner'], 'Only the tree owner can resolve a change request.');
    const changeRequest = await deps.prisma.changeRequest.findFirst({ where: { id: requestId, treeId: tree.id } });
    if (!changeRequest) throw new NotFoundError('That note no longer exists.');
    if (changeRequest.status === 'open') {
      await deps.prisma.changeRequest.update({ where: { id: changeRequest.id }, data: { status: 'resolved', resolvedAt: deps.now(), resolvedById: user.id } });
      await deps.prisma.auditEvent.create({ data: { treeId: tree.id, actorId: user.id, action: 'review.resolve', targetType: 'change_request', targetId: changeRequest.id } });
    }
    return reply.code(204).send();
  });

  /**
   * The reviewer's own view. The first signed-in person to open the link claims it
   * (QUESTIONS Q1); after that it belongs to them, so a forwarded link can't be used.
   */
  async function claimAssignment(request: FastifyRequest) {
    const { user } = requireAuth(request);
    const { token } = request.params as { token: string };
    const parsed = readLinkToken(deps.env.SESSION_SECRET, 'review', token);
    if (!parsed) throw new NotFoundError(INVALID_REVIEW, 'review_invalid');
    const assignment = await deps.prisma.reviewAssignment.findUnique({ where: { id: parsed.rowId }, include: { ...people, tree: true } });
    if (!assignment || assignment.tokenHash !== parsed.tokenHash) throw new NotFoundError(INVALID_REVIEW, 'review_invalid');
    if (assignment.revokedAt) throw new GoneError('This review was withdrawn by the tree’s owner.', 'review_withdrawn');
    if (assignment.reviewerUserId && assignment.reviewerUserId !== user.id) {
      throw new ForbiddenError('This review link has already been claimed by someone else. Ask the owner to send you your own link.', 'review_claimed');
    }
    if (!assignment.reviewerUserId) {
      await deps.prisma.reviewAssignment.update({ where: { id: assignment.id }, data: { reviewerUserId: user.id } });
      await deps.prisma.auditEvent.create({ data: { treeId: assignment.treeId, actorId: user.id, action: 'review.open', targetType: 'review', targetId: assignment.id } });
      return { assignment: { ...assignment, reviewerUserId: user.id, reviewer: { firstName: user.firstName, lastName: user.lastName } }, user };
    }
    return { assignment, user };
  }

  app.get('/api/review/:token', async (request, reply): Promise<ReviewTreeDto> => {
    reply.header('cache-control', 'no-store');
    const { assignment } = await claimAssignment(request);
    const graph = await loadGraph(deps.prisma, assignment.treeId, assignment.tree.focusPersonId);
    return {
      tree: { id: assignment.tree.id, name: assignment.tree.name, status: assignment.tree.status },
      graph,
      assignment: toAssignmentDto(assignment),
      changeRequests: await changeRequestsFor(assignment.treeId),
    };
  });

  app.post('/api/review/:token/approve', async (request, reply) => {
    const { assignment, user } = await claimAssignment(request);
    if (assignment.tree.status !== 'in_review') throw new ConflictError('This tree isn’t waiting for review right now.', 'not_in_review');
    const now = deps.now();
    await deps.prisma.$transaction([
      deps.prisma.reviewAssignment.update({ where: { id: assignment.id }, data: { decision: 'approved', decidedAt: now } }),
      deps.prisma.tree.update({ where: { id: assignment.treeId }, data: { status: 'approved' } }),
      deps.prisma.auditEvent.create({ data: { treeId: assignment.treeId, actorId: user.id, action: 'review.approve', targetType: 'tree', targetId: assignment.treeId, after: { status: 'approved' } } }),
    ]);
    await notifyOwner(assignment.tree, `${userDisplayName(user) ?? 'Your reviewer'} approved “${assignment.tree.name}”`, [
      `${userDisplayName(user) ?? 'Your reviewer'} has approved the family tree “${assignment.tree.name}”.`,
    ]);
    return reply.code(204).send();
  });

  app.post('/api/review/:token/changes', async (request, reply) => {
    const { assignment, user } = await claimAssignment(request);
    if (assignment.tree.status !== 'in_review') throw new ConflictError('This tree isn’t waiting for review right now.', 'not_in_review');
    const { body } = parseInput(changeRequestSchema, request.body);
    const now = deps.now();
    const created = await deps.prisma.$transaction(async (tx) => {
      const changeRequest = await tx.changeRequest.create({
        data: { treeId: assignment.treeId, authorId: user.id, body, createdAt: now },
        include: { author: { select: { firstName: true, lastName: true } } },
      });
      await tx.reviewAssignment.update({ where: { id: assignment.id }, data: { decision: 'changes_requested', decidedAt: now } });
      await tx.tree.update({ where: { id: assignment.treeId }, data: { status: 'changes_requested' } });
      await tx.auditEvent.create({
        data: { treeId: assignment.treeId, actorId: user.id, action: 'review.request_changes', targetType: 'change_request', targetId: changeRequest.id, after: { status: 'changes_requested' } },
      });
      return changeRequest;
    });
    await notifyOwner(assignment.tree, `${userDisplayName(user) ?? 'Your reviewer'} asked for changes to “${assignment.tree.name}”`, [
      `${userDisplayName(user) ?? 'Your reviewer'} has reviewed “${assignment.tree.name}” and asked for some changes:`,
      '',
      body,
    ]);
    return reply.code(201).send({ changeRequest: toChangeRequestDto(created) });
  });
}
