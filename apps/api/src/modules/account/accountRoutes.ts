import {
  changePasswordSchema,
  completeUploadSchema,
  deleteAccountSchema,
  updateProfileSchema,
  uploadTargetRequestSchema,
  type DeletionSummaryDto,
} from '@kinfolk/shared/schemas/account';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { clearSessionCookies } from '../../lib/cookies';
import { hashPassword, verifyPassword } from '../../lib/crypto';
import type { AppDeps } from '../../lib/deps';
import { ConflictError, ValidationError } from '../../lib/errors';
import { finalizeImageUpload } from '../../lib/images';
import { parseInput } from '../../lib/validate';
import { requireAuth } from '../auth/authenticate';
import type { AuthRateLimits } from '../auth/authRoutes';
import { revokeAllSessions, toUserDto } from '../auth/sessionService';
import { buildAccountExport, deleteAccount, deletionSummary } from './accountService';

export function fileUrl(key: string): string {
  return `/api/files/${key}`;
}

export function keyFromFileUrl(url: string | null): string | null {
  return url?.startsWith('/api/files/') ? url.slice('/api/files/'.length) : null;
}

export async function accountRoutes(app: FastifyInstance, opts: { deps: AppDeps; rateLimit: AuthRateLimits }) {
  const { deps } = opts;
  // Both routes verify a password, so a stolen cookie gets as few guesses here as at sign-in.
  const guarded = { config: { rateLimit: opts.rateLimit } };

  app.patch('/api/account', guarded, async (request) => {
    const { user } = requireAuth(request);
    const input = parseInput(updateProfileSchema, request.body);
    if (input.email !== user.email) {
      if (user.passwordHash) {
        const ok = input.currentPassword ? await verifyPassword(input.currentPassword, user.passwordHash) : false;
        if (!ok) {
          const message = 'Enter your current password to change your email.';
          throw new ValidationError(message, { currentPassword: message });
        }
      }
      const taken = await deps.prisma.user.findUnique({ where: { email: input.email } });
      if (taken) {
        const message = 'Another account already uses this email.';
        throw new ConflictError(message, 'email_taken', { email: message });
      }
    }
    const updated = await deps.prisma.user.update({
      where: { id: user.id },
      data: { firstName: input.firstName, lastName: input.lastName, email: input.email },
    });
    return { user: toUserDto(updated) };
  });

  app.post('/api/account/password', guarded, async (request) => {
    const { user, sessionId } = requireAuth(request);
    const input = parseInput(changePasswordSchema, request.body);
    if (user.passwordHash) {
      const ok = input.currentPassword ? await verifyPassword(input.currentPassword, user.passwordHash) : false;
      if (!ok) {
        const message = "That isn't your current password.";
        throw new ValidationError(message, { currentPassword: message });
      }
    }
    const updated = await deps.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    // Sign out every other device; keep this one.
    await deps.prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null, NOT: { id: sessionId } },
      data: { revokedAt: deps.now() },
    });
    return { user: toUserDto(updated) };
  });

  app.post('/api/account/avatar/upload-target', async (request) => {
    const { user } = requireAuth(request);
    const input = parseInput(uploadTargetRequestSchema, request.body);
    return deps.storage.createUploadTarget(`uploads/raw/${user.id}/${randomUUID()}`, input.contentType, input.size);
  });

  app.post('/api/account/avatar', async (request) => {
    const { user } = requireAuth(request);
    const { key } = parseInput(completeUploadSchema, request.body);
    if (!key.startsWith(`uploads/raw/${user.id}/`) || key.includes('..')) {
      throw new ValidationError("That upload doesn't belong to you.");
    }
    const finalKey = await finalizeImageUpload(deps.storage, key, `avatars/${user.id}/${randomUUID()}.webp`);
    const previous = keyFromFileUrl(user.avatarUrl);
    const updated = await deps.prisma.user.update({ where: { id: user.id }, data: { avatarUrl: fileUrl(finalKey) } });
    if (previous) await deps.storage.delete(previous);
    return { user: toUserDto(updated) };
  });

  app.delete('/api/account/avatar', async (request) => {
    const { user } = requireAuth(request);
    const previous = keyFromFileUrl(user.avatarUrl);
    const updated = await deps.prisma.user.update({ where: { id: user.id }, data: { avatarUrl: null } });
    if (previous) await deps.storage.delete(previous);
    return { user: toUserDto(updated) };
  });

  app.get('/api/account/deletion-summary', async (request): Promise<DeletionSummaryDto> => {
    const { user } = requireAuth(request);
    return deletionSummary(deps, user);
  });

  app.get('/api/account/export', async (request, reply) => {
    const { user } = requireAuth(request);
    const data = await buildAccountExport(deps, user);
    const stamp = deps.now().toISOString().slice(0, 10);
    return reply
      .header('content-disposition', `attachment; filename="kinfolk-export-${stamp}.json"`)
      .header('cache-control', 'no-store')
      .type('application/json')
      .send(JSON.stringify(data, null, 2));
  });

  app.delete('/api/account', async (request, reply) => {
    const { user } = requireAuth(request);
    const { confirmEmail } = parseInput(deleteAccountSchema, request.body);
    if (confirmEmail.trim().toLowerCase() !== user.email) {
      const message = 'Type your email address exactly as shown to confirm.';
      throw new ValidationError(message, { confirmEmail: message });
    }
    await revokeAllSessions(deps, user.id);
    await deleteAccount(deps, user);
    clearSessionCookies(reply, deps.env);
    return reply.code(204).send();
  });
}
