import { deriveKey, sha256, signToken, verifyToken } from './crypto';

/** Share links, relative invitations, and review links travel as bearer tokens in URLs (QUESTIONS Q24). */
export type LinkPurpose = 'share-link' | 'invitation' | 'review';

interface LinkPayload {
  /** The database row this token belongs to. */
  rid: string;
  exp: number;
}

/** A link with no expiry still carries a signature expiry; the database row is the real limit. */
const FAR_FUTURE_MS = 100 * 365 * 24 * 60 * 60 * 1000;

export function mintLinkToken(secret: string, purpose: LinkPurpose, rowId: string, expiresAt: Date | null, now: Date): { token: string; tokenHash: string } {
  const token = signToken<LinkPayload>(deriveKey(secret, purpose), { rid: rowId, exp: (expiresAt ?? new Date(now.getTime() + FAR_FUTURE_MS)).getTime() });
  return { token, tokenHash: sha256(token) };
}

/**
 * Checks the signature before any database lookup, so a guessed or tampered token costs nothing.
 * Returns the row id and the hash to match against the stored one, or null.
 */
export function readLinkToken(secret: string, purpose: LinkPurpose, token: string): { rowId: string; tokenHash: string } | null {
  if (token.length > 512) return null;
  // Expiry is enforced from the database row, which can say "expired" in words, so the signature check ignores it (now = 0).
  const payload = verifyToken<LinkPayload>(deriveKey(secret, purpose), token, 0);
  if (!payload || typeof payload.rid !== 'string') return null;
  return { rowId: payload.rid, tokenHash: sha256(token) };
}

export function personDisplayName(person: { firstName: string; lastName: string | null; isPlaceholder: boolean }): string {
  const name = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
  return name || 'Unnamed person';
}

export function userDisplayName(user: { firstName: string; lastName: string } | null | undefined): string | null {
  if (!user) return null;
  return `${user.firstName} ${user.lastName}`.trim() || null;
}
