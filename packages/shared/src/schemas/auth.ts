import { z } from 'zod';

/** Lower-cased, trimmed email. Messages are written for the person filling the form in. */
export const emailSchema = z
  .string({ required_error: 'Enter your email address.' })
  .trim()
  .min(1, 'Enter your email address.')
  .max(254, 'That email address is too long.')
  .email('Enter an email address like name@example.com.')
  .transform((value) => value.toLowerCase());

export const PASSWORD_MIN_LENGTH = 10;

export const passwordSchema = z
  .string({ required_error: 'Enter a password.' })
  .min(1, 'Enter a password.')
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(200, 'Use 200 characters or fewer.');

export const personNameSchema = (label: string) =>
  z
    .string({ required_error: `Enter your ${label}.` })
    .trim()
    .min(1, `Enter your ${label}.`)
    .max(100, `Use 100 characters or fewer for your ${label}.`);

export const signUpSchema = z.object({
  firstName: personNameSchema('first name'),
  lastName: personNameSchema('last name'),
  email: emailSchema,
  password: passwordSchema,
});
export type SignUpInput = z.input<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string({ required_error: 'Enter your password.' }).min(1, 'Enter your password.'),
});
export type SignInInput = z.input<typeof signInSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

export const verifyResetCodeSchema = z.object({
  code: z
    .string({ required_error: 'Enter the 6-digit code from the email.' })
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from the email.'),
});
export type VerifyResetCodeInput = z.input<typeof verifyResetCodeSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Type the new password again.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: "The two passwords don't match.",
  });
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

export const userDtoSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
  hasPassword: z.boolean(),
  createdAt: z.string(),
});
export type UserDto = z.infer<typeof userDtoSchema>;

export const authProvidersSchema = z.object({
  google: z.object({ mode: z.enum(['google', 'dev', 'off']) }),
});
export type AuthProvidersDto = z.infer<typeof authProvidersSchema>;

/** Every API error has this shape. `fields` maps a form field name to its message. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string()).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
