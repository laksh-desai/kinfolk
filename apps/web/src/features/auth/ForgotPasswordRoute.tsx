import { forgotPasswordSchema } from '@kinfolk/shared/schemas/auth';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { FormAlert } from '../../components/FormAlert';
import { TextField } from '../../components/TextField';
import { useForm } from '../../lib/useForm';
import { AuthLayout } from './AuthLayout';
import { authApi } from './authApi';

export function Component() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const expired = params.get('expired') === '1' ? 'That reset request expired. Enter your email to get a new code.' : null;
  const form = useForm({
    schema: forgotPasswordSchema,
    initialValues: { email: '' },
    labels: { email: 'Email' },
    idPrefix: 'forgot',
    onSubmit: async (values) => {
      await authApi.requestReset(values);
      navigate('/forgot-password/verify');
    },
  });

  return (
    <AuthLayout
      title="Reset your password"
      intro="Enter the email you sign in with. We’ll send a 6-digit code to it."
      footer={
        <Link to="/login" className="font-semibold text-accent underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5">
        <FormAlert message={form.formError ?? expired} alertRef={form.formErrorRef} />
        <TextField field={form.field('email')} label="Email" type="email" autoComplete="email" required />
        <Button type="submit" variant="primary" pending={form.submitting} pendingLabel="Sending code…" className="w-full">
          Send code
        </Button>
      </form>
    </AuthLayout>
  );
}
