import { z } from 'zod';
import { emailSchema, passwordSchema, personNameSchema } from './auth';

export const updateProfileSchema = z.object({
  firstName: personNameSchema('first name'),
  lastName: personNameSchema('last name'),
  email: emailSchema,
  /** Required only when the email changes on an account that has a password. */
  currentPassword: z.string().optional(),
});
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    /** Absent for Google-only accounts setting a first password. */
    currentPassword: z.string().optional(),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Type the new password again.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: "The two passwords don't match.",
  });
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

export const deleteAccountSchema = z.object({
  confirmEmail: z.string().trim().min(1, 'Type your email address to confirm.'),
});
export type DeleteAccountInput = z.input<typeof deleteAccountSchema>;

export const deletionSummarySchema = z.object({
  email: z.string(),
  ownedTrees: z.array(z.object({ id: z.string(), name: z.string(), peopleCount: z.number() })),
  sharedTreeCount: z.number(),
});
export type DeletionSummaryDto = z.infer<typeof deletionSummarySchema>;

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const uploadTargetRequestSchema = z.object({
  contentType: z.enum(ALLOWED_IMAGE_TYPES, {
    errorMap: () => ({ message: 'Choose a JPEG, PNG, or WebP image.' }),
  }),
  size: z
    .number()
    .int()
    .positive('That file is empty.')
    .max(MAX_IMAGE_BYTES, 'Choose an image smaller than 8 MB.'),
});
export type UploadTargetRequest = z.input<typeof uploadTargetRequestSchema>;

export const uploadTargetSchema = z.object({
  key: z.string(),
  url: z.string(),
  method: z.literal('PUT'),
  headers: z.record(z.string()),
});
export type UploadTargetDto = z.infer<typeof uploadTargetSchema>;

/**
 * Public records (SPEC deviation, ADR 034): a PDF pulled from a government records site by an
 * ATS employee and attached to one person. PDF only — the server checks the bytes, not the
 * name — and larger than a photo, because a records file runs to many scanned pages.
 */
export const DOCUMENT_TYPE = 'application/pdf';
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export const documentUploadTargetRequestSchema = z.object({
  contentType: z.literal(DOCUMENT_TYPE, { errorMap: () => ({ message: 'Public records have to be a PDF.' }) }),
  size: z
    .number()
    .int()
    .positive('That file is empty.')
    .max(MAX_DOCUMENT_BYTES, 'Choose a PDF smaller than 25 MB.'),
});
export type DocumentUploadTargetRequest = z.input<typeof documentUploadTargetRequestSchema>;

/** Unlocking public records: one shared passphrase, checked by the server (ADR 037). */
export const recordsUnlockSchema = z.object({
  passphrase: z.string().min(1, 'Enter the passphrase for public records.'),
});
export type RecordsUnlockRequest = z.input<typeof recordsUnlockSchema>;

export const recordsStateSchema = z.object({ required: z.boolean(), unlocked: z.boolean() });
export type RecordsStateDto = z.infer<typeof recordsStateSchema>;

export const completeUploadSchema = z.object({ key: z.string().min(1) });
