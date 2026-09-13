import { deriveKey, signToken, verifyToken } from '../../../lib/crypto';
import { UnauthorizedError } from '../../../lib/errors';
import type { OAuthProfile, OAuthProvider } from './oauthProvider';

interface DevCode {
  email: string;
  firstName: string;
  lastName: string;
  exp: number;
}

/**
 * Development stand-in for Google, used only when no Google credentials are configured
 * (production refuses to boot without them). The consent form is served by the API; it
 * mints a signed short-lived code and redirects to the *same* callback route as Google.
 */
export class DevOAuthProvider implements OAuthProvider {
  readonly mode = 'dev' as const;
  private readonly codeKey: Buffer;

  constructor(sessionSecret: string) {
    this.codeKey = deriveKey(sessionSecret, 'dev-oauth-code');
  }

  authorizationUrl(state: string): string {
    return `/api/auth/oauth/dev/authorize?${new URLSearchParams({ state }).toString()}`;
  }

  mintCode(profile: { email: string; firstName: string; lastName: string }): string {
    return signToken<DevCode>(this.codeKey, { ...profile, exp: Date.now() + 2 * 60_000 });
  }

  async exchangeCode(code: string): Promise<OAuthProfile> {
    const payload = verifyToken<DevCode>(this.codeKey, code);
    if (!payload) throw new UnauthorizedError("Sign-in didn't complete. Please try again.", 'oauth_failed');
    return {
      provider: 'google',
      providerUserId: `dev:${payload.email}`,
      email: payload.email,
      emailVerified: true,
      firstName: payload.firstName,
      lastName: payload.lastName,
    };
  }
}
