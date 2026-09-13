import { PASSWORD_MIN_LENGTH, signUpSchema } from '@kinfolk/shared/schemas/auth';
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

export function Component() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));

  const form = useForm({
    schema: signUpSchema,
    initialValues: { firstName: '', lastName: '', email: '', password: '' },
    labels: { firstName: 'First name', lastName: 'Last name', email: 'Email', password: 'Password' },
    idPrefix: 'sign-up',
    onSubmit: async (values) => {
      const { user } = await authApi.signUp(values);
      queryClient.setQueryData(sessionQuery.queryKey, user);
      navigate(returnTo, { replace: true });
    },
  });

  return (
    <AuthLayout
      title="Create your account"
      intro="Map your family and the details your advisor needs, at your own pace."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to={returnTo === '/' ? '/login' : `/login?${new URLSearchParams({ returnTo })}`}
            className="font-semibold text-accent underline underline-offset-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormAlert message={form.formError} alertRef={form.formErrorRef} />
        <GoogleButton returnTo={returnTo} />
        <div className="flex items-center gap-3 text-sm text-ink-muted" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          or with email
          <span className="h-px flex-1 bg-line" />
        </div>
        <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField field={form.field('firstName')} label="First name" autoComplete="given-name" required />
            <TextField field={form.field('lastName')} label="Last name" autoComplete="family-name" required />
          </div>
          <TextField field={form.field('email')} label="Email" type="email" autoComplete="email" required />
          <PasswordField
            field={form.field('password')}
            label="Password"
            hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short sentence is easy to remember.`}
            autoComplete="new-password"
            required
          />
          <Button type="submit" variant="primary" pending={form.submitting} pendingLabel="Creating your account…" className="w-full">
            Create account
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
