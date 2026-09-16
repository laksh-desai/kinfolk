import type { OAuthProfile, OAuthProvider } from './oauthProvider';

/**
 * No Google sign-in. Used whenever the app runs outside development without real Google
 * credentials — a deployed preview, say (ADR 036). The development stand-in mints a session for
 * any email typed into its consent form, which is exactly right on a laptop and a way in for
 * anyone on a public URL, so it must never be the fallback off a developer's machine.
 *
 * Nothing calls these: `authRoutes` does not register the OAuth routes in this mode, and the web
 * app hides the button because `/api/auth/providers` reports "off".
 */
export class DisabledOAuthProvider implements OAuthProvider {
  readonly mode = 'off' as const;

  authorizationUrl(): string {
    throw new Error('Google sign-in is not configured.');
  }

  exchangeCode(): Promise<OAuthProfile> {
    throw new Error('Google sign-in is not configured.');
  }
}
