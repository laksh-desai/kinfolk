import type { User } from '@prisma/client';
import type { SignInInput, SignUpInput } from '@kinfolk/shared/schemas/auth';
import { hashPassword, verifyPassword } from '../../lib/crypto';
import type { AppDeps } from '../../lib/deps';
import { ConflictError, UnauthorizedError } from '../../lib/errors';
import type { OAuthProfile } from './oauth/oauthProvider';

type ParsedSignUp = Required<SignUpInput>;
type ParsedSignIn = Required<SignInInput>;

// Verified against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH_PROMISE = hashPassword('kinfolk-timing-equaliser');

export async function signUp(deps: AppDeps, input: ParsedSignUp): Promise<User> {
  const existing = await deps.prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError('An account with this email already exists. Sign in instead.', 'email_taken', {
      email: 'An account with this email already exists. Sign in instead.',
    });
  }
  return deps.prisma.user.create({
    data: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash: await hashPassword(input.password),
    },
  });
}

export async function signIn(deps: AppDeps, input: ParsedSignIn): Promise<User> {
  const user = await deps.prisma.user.findUnique({ where: { email: input.email } });
  let ok = false;
  if (user?.passwordHash) {
    ok = await verifyPassword(input.password, user.passwordHash);
  } else {
    await verifyPassword(input.password, await DUMMY_HASH_PROMISE);
  }
  if (!user || !ok) {
    const message = user && !user.passwordHash
      ? 'This account signs in with Google. Use "Continue with Google", or reset your password to add one.'
      : "That email and password don't match an account.";
    throw new UnauthorizedError(message, 'invalid_credentials');
  }
  return user;
}

/** Finds or creates the user for a Google (or dev-Google) profile. */
export async function completeOAuthSignIn(deps: AppDeps, profile: OAuthProfile): Promise<User> {
  const linked = await deps.prisma.oAuthAccount.findUnique({
    where: { provider_providerUserId: { provider: profile.provider, providerUserId: profile.providerUserId } },
    include: { user: true },
  });
  if (linked) return linked.user;

  const byEmail = await deps.prisma.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    if (!profile.emailVerified) {
      throw new UnauthorizedError(
        'An account with this email already exists. Sign in with your password first.',
        'oauth_email_unverified',
      );
    }
    await deps.prisma.oAuthAccount.create({
      data: { provider: profile.provider, providerUserId: profile.providerUserId, userId: byEmail.id },
    });
    return byEmail;
  }

  return deps.prisma.user.create({
    data: {
      email: profile.email,
      firstName: profile.firstName || profile.email.split('@')[0] || 'New',
      lastName: profile.lastName,
      oauthAccounts: { create: { provider: profile.provider, providerUserId: profile.providerUserId } },
    },
  });
}
