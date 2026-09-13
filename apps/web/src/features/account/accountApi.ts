import type {
  ChangePasswordInput,
  DeletionSummaryDto,
  UpdateProfileInput,
  UploadTargetDto,
} from '@kinfolk/shared/schemas/account';
import type { UserDto } from '@kinfolk/shared/schemas/auth';
import { api } from '../../lib/api';

export const accountApi = {
  updateProfile: (input: UpdateProfileInput) => api<{ user: UserDto }>('/api/account', { method: 'PATCH', body: input }),
  changePassword: (input: ChangePasswordInput) =>
    api<{ user: UserDto }>('/api/account/password', { method: 'POST', body: input }),
  deletionSummary: () => api<DeletionSummaryDto>('/api/account/deletion-summary'),
  deleteAccount: (confirmEmail: string) => api<undefined>('/api/account', { method: 'DELETE', body: { confirmEmail } }),
  removeAvatar: () => api<{ user: UserDto }>('/api/account/avatar', { method: 'DELETE' }),
  uploadAvatar: async (file: File) => {
    const target = await api<UploadTargetDto>('/api/account/avatar/upload-target', {
      method: 'POST',
      body: { contentType: file.type, size: file.size },
    });
    await uploadToTarget(target, file);
    return api<{ user: UserDto }>('/api/account/avatar', { method: 'POST', body: { key: target.key } });
  },
};

/** Same call for the filesystem dev adapter (an API route) and an S3 presigned URL. */
export async function uploadToTarget(target: UploadTargetDto, file: File): Promise<void> {
  if (target.url.startsWith('/api/')) {
    await api<undefined>(target.url, { method: 'PUT', rawBody: { data: file, contentType: file.type }, timeoutMs: 120_000 });
    return;
  }
  const response = await fetch(target.url, { method: 'PUT', headers: target.headers, body: file });
  if (!response.ok) throw new Error("The upload didn't finish. Please try again.");
}
