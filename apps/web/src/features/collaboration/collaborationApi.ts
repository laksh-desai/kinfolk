import type {
  AccessDto,
  AccessListDto,
  AccessRole,
  AddAccessInput,
  CreatedShareLinkDto,
  InboxDto,
  InvitationDto,
  InvitationPreviewDto,
  LinkRequestDto,
  SharedTreeDto,
  ShareLinkDto,
} from '@kinfolk/shared/schemas/collaboration';
import { queryOptions } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const accessQuery = (treeId: string) =>
  queryOptions({ queryKey: ['tree', treeId, 'access'] as const, queryFn: () => api<AccessListDto>(`/api/trees/${treeId}/access`) });

export const shareLinksQuery = (treeId: string) =>
  queryOptions({
    queryKey: ['tree', treeId, 'share-links'] as const,
    queryFn: async () => (await api<{ links: ShareLinkDto[] }>(`/api/trees/${treeId}/share-links`)).links,
  });

export const invitationsQuery = (treeId: string) =>
  queryOptions({
    queryKey: ['tree', treeId, 'invitations'] as const,
    queryFn: async () => (await api<{ invitations: InvitationDto[] }>(`/api/trees/${treeId}/invitations`)).invitations,
  });

export const linkRequestsQuery = (treeId: string) =>
  queryOptions({
    queryKey: ['tree', treeId, 'link-requests'] as const,
    queryFn: async () => (await api<{ requests: LinkRequestDto[] }>(`/api/trees/${treeId}/link-requests`)).requests,
  });

export const inboxQuery = queryOptions({ queryKey: ['inbox'] as const, queryFn: () => api<InboxDto>('/api/me/inbox'), staleTime: 30_000 });

export const invitationPreviewQuery = (token: string) =>
  queryOptions({ queryKey: ['invitation', token] as const, queryFn: () => api<InvitationPreviewDto>(`/api/invitations/${encodeURIComponent(token)}`), retry: false });

export const sharedTreeQuery = (token: string) =>
  queryOptions({ queryKey: ['shared', token] as const, queryFn: () => api<SharedTreeDto>(`/api/shared/${encodeURIComponent(token)}`), retry: false, staleTime: 60_000 });

export const collaborationApi = {
  addAccess: (treeId: string, input: AddAccessInput) => api<{ access: AccessDto }>(`/api/trees/${treeId}/access`, { method: 'POST', body: input }),
  changeRole: (treeId: string, accessId: string, role: AccessRole) =>
    api<{ access: AccessDto }>(`/api/trees/${treeId}/access/${accessId}`, { method: 'PATCH', body: { role } }),
  revokeAccess: (treeId: string, accessId: string) => api<undefined>(`/api/trees/${treeId}/access/${accessId}`, { method: 'DELETE' }),
  answerAccessInvite: (accessId: string, decision: 'accept' | 'decline') => api<undefined>(`/api/me/access-invites/${accessId}/${decision}`, { method: 'POST' }),
  createShareLink: (treeId: string, expiresInDays: 7 | 30 | 90 | null) =>
    api<CreatedShareLinkDto>(`/api/trees/${treeId}/share-links`, { method: 'POST', body: { expiresInDays } }),
  revokeShareLink: (treeId: string, linkId: string) => api<undefined>(`/api/trees/${treeId}/share-links/${linkId}`, { method: 'DELETE' }),
  invite: (treeId: string, personId: string, email: string) =>
    api<{ invitation: InvitationDto }>(`/api/trees/${treeId}/invitations`, { method: 'POST', body: { personId, email } }),
  resendInvitation: (treeId: string, invitationId: string) =>
    api<{ invitation: InvitationDto }>(`/api/trees/${treeId}/invitations/${invitationId}/resend`, { method: 'POST' }),
  withdrawInvitation: (treeId: string, invitationId: string) => api<undefined>(`/api/trees/${treeId}/invitations/${invitationId}`, { method: 'DELETE' }),
  acceptInvitation: (token: string) => api<{ invitation: InvitationDto }>(`/api/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST' }),
  requestLink: (invitationId: string, fromTreeId: string) =>
    api<{ id: string }>(`/api/me/invitations/${invitationId}/link-request`, { method: 'POST', body: { fromTreeId } }),
  answerLinkRequest: (treeId: string, requestId: string, decision: 'approve' | 'reject') =>
    api<undefined>(`/api/trees/${treeId}/link-requests/${requestId}/${decision}`, { method: 'POST' }),
};
