import { addAccessSchema, updateAccessSchema, type AccessDto, type AccessListDto } from '@kinfolk/shared/schemas/collaboration';
import type { Access } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../lib/deps';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { userDisplayName } from '../../lib/linkTokens';
import { requireTreeRole } from '../../lib/treeAccess';
import { parseInput } from '../../lib/validate';
import { requireAuth } from '../auth/authenticate';

export interface InviteRateLimits {
  max: number;
  timeWindow: string;
}

/** Email addresses are for the owner, who manages access, and for the person themselves. */
function toAccessDto(access: Access, showEmail: boolean): AccessDto {
  return {
    id: access.id,
    email: showEmail ? access.email : null,
    name: access.name,
    role: access.role,
    status: access.status,
    invitedAt: access.invitedAt.toISOString(),
    acceptedAt: access.acceptedAt?.toISOString() ?? null,
  };
}

/** Per-tree access control (SPEC §5.6, QUESTIONS Q22). Only the owner changes anything; every member can see who has access. */
export async function accessRoutes(app: FastifyInstance, opts: { deps: AppDeps; rateLimit: InviteRateLimits }) {
  const { deps } = opts;

  app.get('/api/trees/:treeId/access', async (request): Promise<AccessListDto> => {
    const { treeId } = request.params as { treeId: string };
    const { tree, role } = await requireTreeRole(deps, request, treeId, ['owner', 'editor', 'viewer', 'reviewer']);
    const { user } = requireAuth(request);
    const owner = await deps.prisma.user.findUniqueOrThrow({ where: { id: tree.ownerId }, select: { id: true, firstName: true, lastName: true, email: true } });
    const members = await deps.prisma.access.findMany({ where: { treeId: tree.id, status: { not: 'revoked' } }, orderBy: { invitedAt: 'asc' } });
    const manages = role === 'owner';
    const mine = user.email.toLowerCase();
    return {
      owner: { name: userDisplayName(owner) ?? 'The owner', email: manages || owner.id === user.id ? owner.email : null },
      members: members.map((member) => toAccessDto(member, manages || member.email === mine)),
      canManage: manages,
    };
  });

  app.post('/api/trees/:treeId/access', { config: { rateLimit: opts.rateLimit } }, async (request, reply) => {
    const { treeId } = request.params as { treeId: string };
    const { tree, user } = await requireTreeRole(deps, request, treeId, ['owner'], 'Only the tree owner can share it.');
    const input = parseInput(addAccessSchema, request.body);
    const owner = await deps.prisma.user.findUniqueOrThrow({ where: { id: tree.ownerId } });
    if (input.email === owner.email.toLowerCase()) {
      throw new ValidationError('That’s the owner’s own email address.', { email: 'That’s the owner’s own email address — they already have full access.' });
    }
    const existing = await deps.prisma.access.findUnique({ where: { treeId_email: { treeId: tree.id, email: input.email } } });
    if (existing && existing.status !== 'revoked') {
      const message = `${input.email} already ${existing.status === 'active' ? 'has access' : 'has an invitation'}. Change their role in the list instead.`;
      throw new ConflictError(message, 'access_exists', { email: message });
    }
    const access = existing
      ? await deps.prisma.access.update({
          where: { id: existing.id },
          data: { name: input.name, role: input.role, status: 'invited', invitedAt: deps.now(), acceptedAt: null, userId: null, invitedById: user.id },
        })
      : await deps.prisma.access.create({ data: { treeId: tree.id, email: input.email, name: input.name, role: input.role, invitedById: user.id, invitedAt: deps.now() } });
    await deps.prisma.auditEvent.create({
      data: { treeId: tree.id, actorId: user.id, action: 'access.invite', targetType: 'access', targetId: access.id, after: { email: access.email, role: access.role } },
    });
    const inviter = userDisplayName(user) ?? user.email;
    await deps.mailer.send({
      to: access.email,
      subject: `${inviter} shared “${tree.name}” with you on Kinfolk`,
      text: [
        `${inviter} has invited you to ${access.role === 'editor' ? 'help edit' : 'view'} the family tree “${tree.name}”.`,
        '',
        `Sign in or create an account with this email address (${access.email}), then accept the invitation on your dashboard:`,
        `${deps.env.WEB_URL}/`,
      ].join('\n'),
    });
    return reply.code(201).send({ access: toAccessDto(access, true) });
  });

  app.patch('/api/trees/:treeId/access/:accessId', async (request) => {
    const { treeId, accessId } = request.params as { treeId: string; accessId: string };
    const { tree, user } = await requireTreeRole(deps, request, treeId, ['owner'], 'Only the tree owner can change who has access.');
    const { role } = parseInput(updateAccessSchema, request.body);
    const access = await deps.prisma.access.findFirst({ where: { id: accessId, treeId: tree.id, status: { not: 'revoked' } } });
    if (!access) throw new NotFoundError('That person no longer has access to this tree.');
    const updated = await deps.prisma.access.update({ where: { id: access.id }, data: { role } });
    await deps.prisma.auditEvent.create({
      data: { treeId: tree.id, actorId: user.id, action: 'access.role', targetType: 'access', targetId: access.id, before: { role: access.role }, after: { role } },
    });
    return { access: toAccessDto(updated, true) };
  });

  app.delete('/api/trees/:treeId/access/:accessId', async (request, reply) => {
    const { treeId, accessId } = request.params as { treeId: string; accessId: string };
    const { tree, user } = await requireTreeRole(deps, request, treeId, ['owner'], 'Only the tree owner can change who has access.');
    const access = await deps.prisma.access.findFirst({ where: { id: accessId, treeId: tree.id, status: { not: 'revoked' } } });
    if (!access) throw new NotFoundError('That person no longer has access to this tree.');
    await deps.prisma.access.update({ where: { id: access.id }, data: { status: 'revoked' } });
    await deps.prisma.auditEvent.create({
      data: { treeId: tree.id, actorId: user.id, action: 'access.revoke', targetType: 'access', targetId: access.id, before: { email: access.email, role: access.role, status: access.status } },
    });
    return reply.code(204).send();
  });

  /** The signed-in person's own pending access invitations, matched by their email. */
  app.post('/api/me/access-invites/:accessId/:decision', async (request, reply) => {
    const { user } = requireAuth(request);
    const { accessId, decision } = request.params as { accessId: string; decision: string };
    if (decision !== 'accept' && decision !== 'decline') throw new NotFoundError();
    const access = await deps.prisma.access.findFirst({ where: { id: accessId, email: user.email.toLowerCase(), status: 'invited' } });
    if (!access) throw new NotFoundError('That invitation is no longer open. The owner may have withdrawn it.');
    if (decision === 'accept') {
      await deps.prisma.access.update({ where: { id: access.id }, data: { status: 'active', userId: user.id, acceptedAt: deps.now() } });
    } else {
      await deps.prisma.access.update({ where: { id: access.id }, data: { status: 'revoked' } });
    }
    await deps.prisma.auditEvent.create({
      data: { treeId: access.treeId, actorId: user.id, action: `access.${decision}`, targetType: 'access', targetId: access.id },
    });
    return reply.code(204).send();
  });
}
