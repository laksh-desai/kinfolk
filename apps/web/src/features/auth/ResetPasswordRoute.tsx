import { PASSWORD_MIN_LENGTH, resetPasswordSchema } from '@kinfolk/shared/schemas/auth';
import { redirect, useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { FormAlert } from '../../components/FormAlert';
import { PasswordField } from '../../components/PasswordField';
import { queryClient } from '../../lib/queryClient';
import { toast } from '../../lib/toast';
import { useForm } from '../../lib/useForm';
import { AuthLayout } from './AuthLayout';
import { authApi } from './authApi';
import { sessionQuery } from './sessionQuery';

export async function loader() {
  const { stage } = await authApi.resetStatus();
  if (stage === 'pending') return redirect('/forgot-password/verify');
  if (stage === 'none') return redirect('/forgot-password?expired=1');
  return null;
}

export function Component() {
  const navigate = useNavigate();
  const form = useForm({
    schema: resetPasswordSchema,
    initialValues: { password: '', confirmPassword: '' },
    labels: { password: 'New password', confirmPassword: 'Confirm new password' },
    idPrefix: 'reset',
    onSubmit: async (values) => {
      await authApi.resetPassword(values);
      // The cache still holds the signed-out null; the dashboard guard would read it and bounce
      // back to sign in. Fetch the new session before navigating.
      await queryClient.fetchQuery({ ...sessionQuery, staleTime: 0 });
      toast({ title: 'Password changed', description: 'You’re signed in. Other devices have been signed out.', tone: 'success' });
      navigate('/', { replace: true });
    },
  });

  return (
    <AuthLayout title="Choose a new password" intro="This will sign you out everywhere else.">
      <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5">
        <FormAlert message={form.formError} alertRef={form.formErrorRef} />
        <PasswordField
          field={form.field('password')}
          label="New password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          autoComplete="new-password"
          required
        />
        <PasswordField field={form.field('confirmPassword')} label="Confirm new password" autoComplete="new-password" required />
        <Button type="submit" variant="primary" pending={form.submitting} pendingLabel="Saving…" className="w-full">
          Save new password
        </Button>
      </form>
    </AuthLayout>
  );
}
