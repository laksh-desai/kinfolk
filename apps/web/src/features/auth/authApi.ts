import type {
  AuthProvidersDto,
  ForgotPasswordInput,
  ResetPasswordInput,
  SignInInput,
  SignUpInput,
  UserDto,
  VerifyResetCodeInput,
} from '@kinfolk/shared/schemas/auth';
import { api } from '../../lib/api';

export type ResetStage = 'none' | 'pending' | 'verified';

export const authApi = {
  signIn: (input: SignInInput) => api<{ user: UserDto }>('/api/auth/login', { method: 'POST', body: input }),
  signUp: (input: SignUpInput) => api<{ user: UserDto }>('/api/auth/signup', { method: 'POST', body: input }),
  signOut: () => api<undefined>('/api/auth/logout', { method: 'POST' }),
  providers: () => api<AuthProvidersDto>('/api/auth/providers'),
  resetStatus: () => api<{ stage: ResetStage }>('/api/auth/password/status'),
  requestReset: (input: ForgotPasswordInput) =>
    api<{ stage: ResetStage }>('/api/auth/password/forgot', { method: 'POST', body: input }),
  verifyCode: (input: VerifyResetCodeInput) =>
    api<{ stage: ResetStage }>('/api/auth/password/verify', { method: 'POST', body: input }),
  resetPassword: (input: ResetPasswordInput) =>
    api<{ stage: ResetStage }>('/api/auth/password/reset', { method: 'POST', body: input }),
};
