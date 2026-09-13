import { signInSchema } from '@kinfolk/shared/schemas/auth';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { FormAlert } from '../../components/FormAlert';
import { PasswordField } from '../../components/PasswordField';
import { TextField } from '../../components/TextField';
import { queryClient } from '../../lib/queryClient';
import { useForm } from '../../lib/useForm';
import { safeReturnTo } from '../../routes/guards';
import { AuthLayout } from './AuthLayout';
import { authApi } from './authApi';
import { GoogleButton } from './GoogleButton';
import { sessionQuery } from './sessionQuery';

const OAUTH_MESSAGES: Record<string, string> = {
  cancelled: 'Google sign-in was cancelled. You can try again or use your email and password.',
  expired: 'That sign-in attempt expired. Please try again.',
  failed: "Google sign-in didn't complete. Please try again.",
  unverified: 'An account with this email already exists. Sign in with your password first, then you can use Google.',
};

export function Component() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));
  const oauthProblem = OAUTH_MESSAGES[params.get('oauth') ?? ''] ?? null;

  const form = useForm({
    schema: signInSchema,
    initialValues: { email: '', password: '' },
    labels: { email: 'Email', password: 'Password' },
    idPrefix: 'sign-in',
    onSubmit: async (values) => {
      const { user } = await authApi.signIn(values);
      queryClient.setQueryData(sessionQuery.queryKey, user);
      navigate(returnTo, { replace: true });
    },
  });

  return (
    <AuthLayout
      title="Sign in"
      intro="Welcome back. Your family tree is where you left it."
      footer={
        <>
          New to Kinfolk?{' '}
          <Link
            to={returnTo === '/' ? '/signup' : `/signup?${new URLSearchParams({ returnTo })}`}
            className="font-semibold text-accent underline underline-offset-4"
          >
            Create an account
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormAlert message={form.formError ?? oauthProblem} alertRef={form.formErrorRef} />
        <GoogleButton returnTo={returnTo} />
        <div className="flex items-center gap-3 text-sm text-ink-muted" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          or with email
          <span className="h-px flex-1 bg-line" />
        </div>
        <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5">
          <TextField field={form.field('email')} label="Email" type="email" autoComplete="email" required />
          <PasswordField field={form.field('password')} label="Password" autoComplete="current-password" required />
          <Button type="submit" variant="primary" pending={form.submitting} pendingLabel="Signing in…" className="w-full">
            Sign in
          </Button>
        </form>
        <Link to="/forgot-password" className="inline-flex min-h-11 items-center self-center font-semibold text-accent underline underline-offset-4">
          Forgot your password?
        </Link>
      </div>
    </AuthLayout>
  );
}
