import { z } from 'zod';
import type { RedactedTreeGraph } from './graph';
import { uuidSchema } from './person';
import type { TreeStatus } from './tree';

export const ACCESS_ROLES = ['editor', 'viewer'] as const;
export type AccessRole = (typeof ACCESS_ROLES)[number];
export type AccessStatus = 'invited' | 'active' | 'revoked';

const email = z
  .string({ required_error: 'Enter an email address.' })
  .trim()
  .min(1, 'Enter an email address.')
  .max(254, 'That email address is too long.')
  .email('Enter an email address like name@example.com.')
  .transform((value) => value.toLowerCase());

const role = z.enum(ACCESS_ROLES, { errorMap: () => ({ message: 'Choose editor or viewer.' }) });

export const addAccessSchema = z.object({
  name: z
    .string()
    .trim()
    .max(120, 'Use 120 characters or fewer for the name.')
    .optional()
    .transform((value) => (value ? value : null)),
  email,
  role,
});
export type AddAccessInput = z.input<typeof addAccessSchema>;

export const updateAccessSchema = z.object({ role });

export interface AccessDto {
  id: string;
  /** Null for people other than the caller, unless the caller manages access (owner). */
  email: string | null;
  name: string | null;
  role: AccessRole;
  status: AccessStatus;
  invitedAt: string;
  acceptedAt: string | null;
}

export interface AccessListDto {
  owner: { name: string; email: string | null };
  members: AccessDto[];
  /** Whether the caller may add, change, or revoke. */
  canManage: boolean;
}

export const SHARE_LINK_EXPIRY_DAYS = [7, 30, 90] as const;

export const createShareLinkSchema = z.object({
  expiresInDays: z
    .union([z.literal(7), z.literal(30), z.literal(90), z.null()], { errorMap: () => ({ message: 'Choose how long the link should work.' }) })
    .default(30),
});

export interface ShareLinkDto {
  id: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdBy: string | null;
  status: 'active' | 'expired' | 'revoked';
}

/** Returned once, at creation: the full link can't be shown again because only its hash is stored. */
export interface CreatedShareLinkDto {
  link: ShareLinkDto;
  url: string;
}

export interface SharedTreeDto {
  tree: { name: string; status: TreeStatus };
  graph: RedactedTreeGraph;
}

export const INVITATION_STAGES = ['sent', 'joined', 'tree_created', 'linked'] as const;
export type InvitationStage = (typeof INVITATION_STAGES)[number];

export const createInvitationSchema = z.object({ personId: uuidSchema, email });

export interface InvitationDto {
  id: string;
  personId: string;
  email: string;
  stage: InvitationStage;
  sentAt: string;
  joinedAt: string | null;
  treeCreatedAt: string | null;
  linkedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
}

/** What someone holding an invitation link sees before accepting. */
export interface InvitationPreviewDto {
  invitedBy: string | null;
  treeName: string;
  personName: string;
  status: 'open' | 'accepted' | 'expired' | 'revoked';
}

export const requestLinkSchema = z.object({ fromTreeId: uuidSchema });

export interface InboxDto {
  accessInvites: Array<{ id: string; tree: { id: string; name: string }; role: AccessRole; invitedBy: string | null; invitedAt: string }>;
  linkRequests: Array<{
    id: string;
    toTree: { id: string; name: string };
    person: { id: string; name: string };
    fromTree: { id: string; name: string };
    requestedBy: string | null;
    createdAt: string;
  }>;
  invitations: Array<{
    id: string;
    tree: { id: string; name: string };
    personName: string;
    invitedBy: string | null;
    stage: InvitationStage;
    pendingLinkRequest: boolean;
  }>;
  /** Open notes from a reviewer on trees you own (SPEC §5.7). */
  changeRequests: Array<{ id: string; tree: { id: string; name: string }; body: string; author: string | null; createdAt: string }>;
}

export interface LinkRequestDto {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  person: { id: string; name: string };
  fromTree: { id: string; name: string };
  requestedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
}
