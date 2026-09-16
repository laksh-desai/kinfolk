export interface OAuthProfile {
  provider: 'google';
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
}

/**
 * The OAuth seam. Both implementations end in the same callback route, which calls
 * completeOAuthSignIn → issueSession. Only how the authorization code is minted and
 * exchanged differs.
 */
export interface OAuthProvider {
  /** 'off' means no Google sign-in at all: the routes are not registered (ADR 036). */
  readonly mode: 'google' | 'dev' | 'off';
  authorizationUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuthProfile>;
}
