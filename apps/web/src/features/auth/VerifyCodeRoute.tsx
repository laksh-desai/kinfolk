import { verifyResetCodeSchema } from '@kinfolk/shared/schemas/auth';
import { Link, redirect, useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { FormAlert } from '../../components/FormAlert';
import { TextField } from '../../components/TextField';
import { useForm } from '../../lib/useForm';
import { AuthLayout } from './AuthLayout';
import { authApi } from './authApi';

/** Restorable on refresh: the pending reset lives in an httpOnly cookie, not in the URL or page state. */
export async function loader() {
  const { stage } = await authApi.resetStatus();
  if (stage === 'none') return redirect('/forgot-password?expired=1');
  if (stage === 'verified') return redirect('/forgot-password/reset');
  return null;
}

export function Component() {
  const navigate = useNavigate();
  const form = useForm({
    schema: verifyResetCodeSchema,
    initialValues: { code: '' },
    labels: { code: 'Code' },
    idPrefix: 'verify',
    onSubmit: async (values) => {
      await authApi.verifyCode(values);
      navigate('/forgot-password/reset', { replace: true });
    },
  });

  return (
    <AuthLayout
      title="Enter your code"
      intro="If an account exists for that email, a 6-digit code is on its way. It can take a minute to arrive — check your spam folder too."
      footer={
        <Link to="/forgot-password" className="font-semibold text-accent underline underline-offset-4">
          Send a new code
        </Link>
      }
    >
      <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5">
        <FormAlert message={form.formError} alertRef={form.formErrorRef} />
        <TextField
          field={form.field('code')}
          label="Code"
          hint="The code expires 15 minutes after it was sent."
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
        />
        <Button type="submit" variant="primary" pending={form.submitting} pendingLabel="Checking…" className="w-full">
          Continue
        </Button>
      </form>
    </AuthLayout>
  );
}
