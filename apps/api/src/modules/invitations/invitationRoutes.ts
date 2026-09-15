import {
  createInvitationSchema,
  requestLinkSchema,
  type InboxDto,
  type InvitationDto,
  type InvitationPreviewDto,
  type LinkRequestDto,
} from '@kinfolk/shared/schemas/collaboration';
import type { Invitation } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { AppDeps } from '../../lib/deps';
import { ConflictError, GoneError, NotFoundError, ValidationError } from '../../lib/errors';
import { mintLinkToken, personDisplayName, readLinkToken, userDisplayName } from '../../lib/linkTokens';
import { requireTreeRole } from '../../lib/treeAccess';
import { parseInput } from '../../lib/validate';
import { requireAuth } from '../auth/authenticate';
import type { InviteRateLimits } from '../access/accessRoutes';

const INVITATION_DAYS = 30;
const INVALID_INVITATION = 'This invitation link isn’t valid. Check that you copied the whole link, or ask the person who invited you to send it again.';

export function toInvitationDto(invitation: Invitation): InvitationDto {
  return {
    id: invitation.id,
    personId: invitation.personId,
    email: invitation.email,
    stage: invitation.stage,
    sentAt: invitation.sentAt.toISOString(),
    joinedAt: invitation.joinedAt?.toISOString() ?? null,
    treeCreatedAt: invitation.treeCreatedAt?.toISOString() ?? null,
    linkedAt: invitation.linkedAt?.toISOString() ?? null,
    expiresAt: invitation.expiresAt.toISOString(),
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
  };
}

/**
 * Relative invitations and linked trees (SPEC §5.5, QUESTIONS Q22–Q23). Stages advance only
 * from real events: accepting the link (joined), creating a tree (tree_created, in treeRoutes),
 * and the inviting owner approving a link request (linked).
 */
export async function invitationRoutes(app: FastifyInstance, opts: { deps: AppDeps; rateLimit: InviteRateLimits }) {
  const { deps } = opts;
  const limited = { config: { rateLimit: opts.rateLimit } };

  async function sendInvitationEmail(invitation: Invitation, token: string, inviter: string, treeName: string, personName: string) {
    await deps.mailer.send({
      to: invitation.email,
      subject: `${inviter} invited you to build your family tree on Kinfolk`,
      text: [
        `${inviter} is mapping the family tree “${treeName}” and added you as ${personName}.`,
        '',
        'Build your own side of the family, then link it to theirs so both trees stay connected:',
        `${deps.env.WEB_URL}/invite/${token}`,
        '',
        `This link works for ${INVITATION_DAYS} days.`,
      ].join('\n'),
    });
  }

  app.get('/api/trees/:treeId/invitations', async (request) => {
    const { treeId } = request.params as { treeId: string };
    const { tree } = await requireTreeRole(deps, request, treeId, ['owner', 'editor']);
    const invitations = await deps.prisma.invitation.findMany({ where: { treeId: tree.id }, orderBy: { sentAt: 'desc' } });
    return { invitations: invitations.map(toInvitationDto) };
  });

  app.post('/api/trees/:treeId/invitations', limited, async (request, reply) => {
    const { treeId } = request.params as { treeId: string };
    const { tree, user } = await requireTreeRole(deps, request, treeId, ['owner', 'editor'], 'You can view this family tree but not invite people to it.');
    const input = parseInput(createInvitationSchema, request.body);
    const person = await deps.prisma.person.findFirst({ where: { id: input.personId, treeId: tree.id } });
    if (!person) throw new NotFoundError('That person is no longer in this tree.');
    const open = await deps.prisma.invitation.findFirst({ where: { treeId: tree.id, personId: person.id, revokedAt: null, stage: { not: 'linked' } } });
    if (open) {
      const message = `${personDisplayName(person)} already has an invitation. Resend it or withdraw it first.`;
      throw new ConflictError(message, 'invitation_exists', { email: message });
    }
    const now = deps.now();
    const id = randomUUID();
    const expiresAt = new Date(now.getTime() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
    const { token, tokenHash } = mintLinkToken(deps.env.SESSION_SECRET, 'invitation', id, expiresAt, now);
    const invitation = await deps.prisma.invitation.create({
      data: { id, treeId: tree.id, personId: person.id, email: input.email, tokenHash, invitedById: user.id, sentAt: now, expiresAt },
    });
    await deps.prisma.auditEvent.create({
      data: { treeId: tree.id, actorId: user.id, action: 'invitation.send', targetType: 'invitation', targetId: invitation.id, after: { personId: person.id, email: input.email } },
    });
    await sendInvitationEmail(invitation, token, userDisplayName(user) ?? user.email, tree.name, personDisplayName(person));
    return reply.code(201).send({ invitation: toInvitationDto(invitation) });
  });

  app.post('/api/trees/:treeId/invitations/:invitationId/resend', limited, async (request) => {
    const { treeId, invitationId } = request.params as { treeId: string; invitationId: string };
    const { tree, user } = await requireTreeRole(deps, request, treeId, ['owner', 'editor'], 'You can view this family tree but not invite people to it.');
    const invitation = await deps.prisma.invitation.findFirst({ where: { id: invitationId, treeId: tree.id }, include: { person: true } });
    if (!invitation || invitation.revokedAt) throw new NotFoundError('That invitation was withdrawn.');
    if (invitation.stage !== 'sent') throw new ConflictError('They’ve already accepted this invitation, so there’s nothing to resend.', 'invitation_accepted');
    const now = deps.now();
    const expiresAt = new Date(now.getTime() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
    const { token, tokenHash } = mintLinkToken(deps.env.SESSION_SECRET, 'invitation', invitation.id, expiresAt, now);
    const updated = await deps.prisma.invitation.update({ where: { id: invitation.id }, data: { tokenHash, sentAt: now, expiresAt } });
    await deps.prisma.auditEvent.create({ data: { treeId: tree.id, actorId: user.id, action: 'invitation.resend', targetType: 'invitation', targetId: invitation.id } });
    await sendInvitationEmail(updated, token, userDisplayName(user) ?? user.email, tree.name, personDisplayName(invitation.person));
    return { invitation: toInvitationDto(updated) };
  });

  app.delete('/api/trees/:treeId/invitations/:invitationId', async (request, reply) => {
    const { treeId, invitationId } = request.params as { treeId: string; invitationId: string };
    const { tree, user } = await requireTreeRole(deps, request, treeId, ['owner', 'editor'], 'You can view this family tree but not manage its invitations.');
    const invitation = await deps.prisma.invitation.findFirst({ where: { id: invitationId, treeId: tree.id } });
    if (!invitation) throw new NotFoundError('That invitation no longer exists.');
    if (!invitation.revokedAt) {
      await deps.prisma.invitation.update({ where: { id: invitation.id }, data: { revokedAt: deps.now() } });
      await deps.prisma.auditEvent.create({ data: { treeId: tree.id, actorId: user.id, action: 'invitation.revoke', targetType: 'invitation', targetId: invitation.id } });
    }
    return reply.code(204).send();
  });

  async function invitationForToken(token: string) {
    const parsed = readLinkToken(deps.env.SESSION_SECRET, 'invitation', token);
    if (!parsed) throw new NotFoundError(INVALID_INVITATION, 'invitation_invalid');
    const invitation = await deps.prisma.invitation.findUnique({
      where: { id: parsed.rowId },
      include: { tree: true, person: true, invitedBy: { select: { firstName: true, lastName: true } } },
    });
    // A resent invitation replaces the token: the old link stops matching.
    if (!invitation || invitation.tokenHash !== parsed.tokenHash) throw new NotFoundError(INVALID_INVITATION, 'invitation_invalid');
    return invitation;
  }

  /** Public preview for someone holding the link, before they sign in. */
  app.get('/api/invitations/:token', async (request, reply): Promise<InvitationPreviewDto> => {
    const { token } = request.params as { token: string };
    reply.header('cache-control', 'no-store');
    const invitation = await invitationForToken(token);
    const status = invitation.revokedAt ? 'revoked' : invitation.stage !== 'sent' ? 'accepted' : invitation.expiresAt <= deps.now() ? 'expired' : 'open';
    return { invitedBy: userDisplayName(invitation.invitedBy), treeName: invitation.tree.name, personName: personDisplayName(invitation.person), status };
  });

  app.post('/api/invitations/:token/accept', async (request) => {
    const { user } = requireAuth(request);
    const { token } = request.params as { token: string };
    const invitation = await invitationForToken(token);
    if (invitation.revokedAt) throw new GoneError('This invitation was withdrawn by the person who sent it.', 'invitation_revoked');
    if (invitation.stage !== 'sent') {
      if (invitation.inviteeUserId === user.id) return { invitation: toInvitationDto(invitation) };
      throw new ConflictError('Someone has already accepted this invitation.', 'invitation_accepted');
    }
    if (invitation.expiresAt <= deps.now()) throw new GoneError('This invitation has expired. Ask the person who invited you to send it again.', 'invitation_expired');
    const now = deps.now();
    // If they already have a tree of their own, that step is already done.
    const ownTree = await deps.prisma.tree.findFirst({ where: { ownerId: user.id }, orderBy: { createdAt: 'desc' } });
    const updated = await deps.prisma.invitation.update({
      where: { id: invitation.id },
      data: ownTree
        ? { inviteeUserId: user.id, joinedAt: now, stage: 'tree_created', treeCreatedAt: ownTree.createdAt, inviteeTreeId: ownTree.id }
        : { inviteeUserId: user.id, joinedAt: now, stage: 'joined' },
    });
    await deps.prisma.auditEvent.create({ data: { treeId: invitation.treeId, actorId: user.id, action: 'invitation.accept', targetType: 'invitation', targetId: invitation.id } });
    return { invitation: toInvitationDto(updated) };
  });

  /** The invitee asks to link one of their own trees to their person in the inviting tree. */
  app.post('/api/me/invitations/:invitationId/link-request', async (request, reply) => {
    const { user } = requireAuth(request);
    const { invitationId } = request.params as { invitationId: string };
    const { fromTreeId } = parseInput(requestLinkSchema, request.body);
    const invitation = await deps.prisma.invitation.findFirst({ where: { id: invitationId, inviteeUserId: user.id, revokedAt: null } });
    if (!invitation) throw new NotFoundError('That invitation is no longer open.');
    if (invitation.stage === 'linked') throw new ConflictError('Your tree is already linked.', 'already_linked');
    const fromTree = await deps.prisma.tree.findFirst({ where: { id: fromTreeId, ownerId: user.id } });
    if (!fromTree) throw new ValidationError('Choose one of your own family trees.', { fromTreeId: 'Choose one of your own family trees.' });
    if (fromTree.id === invitation.treeId) throw new ValidationError('A tree can’t be linked to itself.', { fromTreeId: 'Choose a different tree.' });
    const pending = await deps.prisma.linkRequest.findFirst({ where: { toTreeId: invitation.treeId, personId: invitation.personId, status: 'pending' } });
    if (pending) throw new ConflictError('A link request is already waiting for the owner.', 'link_request_pending');
    const linkRequest = await deps.prisma.linkRequest.create({
      data: { fromTreeId: fromTree.id, toTreeId: invitation.treeId, personId: invitation.personId, requestedById: user.id, createdAt: deps.now() },
    });
    if (invitation.stage === 'joined' || invitation.inviteeTreeId !== fromTree.id) {
      await deps.prisma.invitation.update({
        where: { id: invitation.id },
        data: { stage: 'tree_created', inviteeTreeId: fromTree.id, treeCreatedAt: invitation.treeCreatedAt ?? fromTree.createdAt },
      });
    }
    await deps.prisma.auditEvent.create({
      data: { treeId: invitation.treeId, actorId: user.id, action: 'link.request', targetType: 'link_request', targetId: linkRequest.id, after: { fromTreeId: fromTree.id } },
    });
    return reply.code(201).send({ id: linkRequest.id });
  });

  app.get('/api/trees/:treeId/link-requests', async (request): Promise<{ requests: LinkRequestDto[] }> => {
    const { treeId } = request.params as { treeId: string };
    const { tree } = await requireTreeRole(deps, request, treeId, ['owner'], 'Only the tree owner can review link requests.');
    const requests = await deps.prisma.linkRequest.findMany({
      where: { toTreeId: tree.id },
      include: { person: true, fromTree: true, requestedBy: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      requests: requests.map((entry) => ({
        id: entry.id,
        status: entry.status,
        person: { id: entry.person.id, name: personDisplayName(entry.person) },
        fromTree: { id: entry.fromTree.id, name: entry.fromTree.name },
        requestedBy: userDisplayName(entry.requestedBy),
        createdAt: entry.createdAt.toISOString(),
        resolvedAt: entry.resolvedAt?.toISOString() ?? null,
      })),
    };
  });

  app.post('/api/trees/:treeId/link-requests/:requestId/:decision', async (request, reply) => {
    const { treeId, requestId, decision } = request.params as { treeId: string; requestId: string; decision: string };
    if (decision !== 'approve' && decision !== 'reject') throw new NotFoundError();
    const { tree, user } = await requireTreeRole(deps, request, treeId, ['owner'], 'Only the tree owner can review link requests.');
    const linkRequest = await deps.prisma.linkRequest.findFirst({ where: { id: requestId, toTreeId: tree.id }, include: { person: true } });
    if (!linkRequest) throw new NotFoundError('That link request no longer exists.');
    if (linkRequest.status !== 'pending') throw new ConflictError('That link request has already been answered.', 'link_request_resolved');
    const now = deps.now();

    if (decision === 'reject') {
      await deps.prisma.linkRequest.update({ where: { id: linkRequest.id }, data: { status: 'rejected', resolvedAt: now, resolvedById: user.id } });
      await deps.prisma.auditEvent.create({ data: { treeId: tree.id, actorId: user.id, action: 'link.reject', targetType: 'link_request', targetId: linkRequest.id } });
      return reply.code(204).send();
    }

    await deps.prisma.$transaction(async (tx) => {
      await tx.linkRequest.update({ where: { id: linkRequest.id }, data: { status: 'approved', resolvedAt: now, resolvedById: user.id } });
      // linkedTreeId is server-managed (ADR 012): this is the only place it is ever set.
      await tx.person.update({ where: { id: linkRequest.personId }, data: { linkedTreeId: linkRequest.fromTreeId } });
      await tx.tree.update({ where: { id: tree.id }, data: { version: { increment: 1 } } });
      await tx.invitation.updateMany({
        where: { treeId: tree.id, personId: linkRequest.personId, inviteeUserId: linkRequest.requestedById ?? undefined, revokedAt: null },
        data: { stage: 'linked', linkedAt: now, inviteeTreeId: linkRequest.fromTreeId },
      });
      // Opening the linked tree needs access to it; the invitee's request is their consent (Q23).
      const fromTree = await tx.tree.findUniqueOrThrow({ where: { id: linkRequest.fromTreeId } });
      if (fromTree.ownerId !== user.id) {
        const email = user.email.toLowerCase();
        const existing = await tx.access.findUnique({ where: { treeId_email: { treeId: fromTree.id, email } } });
        if (!existing || existing.status !== 'active') {
          await tx.access.upsert({
            where: { treeId_email: { treeId: fromTree.id, email } },
            create: { treeId: fromTree.id, email, userId: user.id, role: 'viewer', status: 'active', invitedById: linkRequest.requestedById, invitedAt: now, acceptedAt: now },
            update: { userId: user.id, role: 'viewer', status: 'active', acceptedAt: now },
          });
        }
      }
      await tx.auditEvent.createMany({
        data: [
          { treeId: tree.id, actorId: user.id, action: 'link.approve', targetType: 'link_request', targetId: linkRequest.id },
          {
            treeId: tree.id,
            actorId: user.id,
            action: 'person.update',
            targetType: 'person',
            targetId: linkRequest.personId,
            before: { linkedTreeId: linkRequest.person.linkedTreeId },
            after: { linkedTreeId: linkRequest.fromTreeId },
          },
        ],
      });
    });
    return reply.code(204).send();
  });

  /** Everything waiting on the signed-in person, for the dashboard (SPEC §5.2). */
  app.get('/api/me/inbox', async (request): Promise<InboxDto> => {
    const { user } = requireAuth(request);
    const [accessInvites, linkRequests, invitations] = await Promise.all([
      deps.prisma.access.findMany({
        where: { email: user.email.toLowerCase(), status: 'invited' },
        include: { tree: true, invitedBy: { select: { firstName: true, lastName: true } } },
        orderBy: { invitedAt: 'desc' },
      }),
      deps.prisma.linkRequest.findMany({
        where: { status: 'pending', toTree: { ownerId: user.id } },
        include: { toTree: true, fromTree: true, person: true, requestedBy: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      deps.prisma.invitation.findMany({
        where: { inviteeUserId: user.id, revokedAt: null, stage: { in: ['joined', 'tree_created'] } },
        include: { tree: true, person: true, invitedBy: { select: { firstName: true, lastName: true } } },
        orderBy: { sentAt: 'desc' },
      }),
    ]);
    const pending = await deps.prisma.linkRequest.findMany({
      where: { status: 'pending', requestedById: user.id },
      select: { toTreeId: true, personId: true },
    });
    return {
      accessInvites: accessInvites.map((access) => ({
        id: access.id,
        tree: { id: access.tree.id, name: access.tree.name },
        role: access.role,
        invitedBy: userDisplayName(access.invitedBy),
        invitedAt: access.invitedAt.toISOString(),
      })),
      linkRequests: linkRequests.map((entry) => ({
        id: entry.id,
        toTree: { id: entry.toTree.id, name: entry.toTree.name },
        person: { id: entry.person.id, name: personDisplayName(entry.person) },
        fromTree: { id: entry.fromTree.id, name: entry.fromTree.name },
        requestedBy: userDisplayName(entry.requestedBy),
        createdAt: entry.createdAt.toISOString(),
      })),
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        tree: { id: invitation.tree.id, name: invitation.tree.name },
        personName: personDisplayName(invitation.person),
        invitedBy: userDisplayName(invitation.invitedBy),
        stage: invitation.stage,
        pendingLinkRequest: pending.some((entry) => entry.toTreeId === invitation.treeId && entry.personId === invitation.personId),
      })),
    };
  });
}

