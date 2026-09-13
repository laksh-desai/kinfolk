import { UnauthorizedError } from '../../../lib/errors';
import type { OAuthProfile, OAuthProvider } from './oauthProvider';

interface TokenResponse {
  access_token?: string;
  error?: string;
}

interface UserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
}

const FAILED = "Google sign-in didn't complete. Please try again.";

export class GoogleOAuthProvider implements OAuthProvider {
  readonly mode = 'google' as const;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  authorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthProfile> {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = (await tokenResponse.json()) as TokenResponse;
    if (!tokenResponse.ok || !tokens.access_token) throw new UnauthorizedError(FAILED, 'oauth_failed');

    const infoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoResponse.ok) throw new UnauthorizedError(FAILED, 'oauth_failed');
    const info = (await infoResponse.json()) as UserInfo;
    if (!info.email) throw new UnauthorizedError('Your Google account has no email address we can use.', 'oauth_failed');

    const [first = '', ...rest] = (info.name ?? '').split(' ');
    return {
      provider: 'google',
      providerUserId: info.sub,
      email: info.email.toLowerCase(),
      emailVerified: info.email_verified === true,
      firstName: info.given_name ?? first,
      lastName: info.family_name ?? rest.join(' '),
    };
  }
}
