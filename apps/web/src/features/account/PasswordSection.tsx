import { changePasswordSchema } from '@kinfolk/shared/schemas/account';
import { PASSWORD_MIN_LENGTH } from '@kinfolk/shared/schemas/auth';
import { Button } from '../../components/Button';
import { FormAlert } from '../../components/FormAlert';
import { PasswordField } from '../../components/PasswordField';
import { announce } from '../../lib/announcer';
import { queryClient } from '../../lib/queryClient';
import { toast } from '../../lib/toast';
import { useForm } from '../../lib/useForm';
import { sessionQuery, useCurrentUser } from '../auth/sessionQuery';
import { accountApi } from './accountApi';
import { AccountSection } from './AccountSection';

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };

export function PasswordSection() {
  const user = useCurrentUser();
  const form = useForm({
    schema: changePasswordSchema,
    initialValues: EMPTY,
    labels: { currentPassword: 'Current password', newPassword: 'New password', confirmPassword: 'Confirm new password' },
    idPrefix: 'password',
    onSubmit: async (values) => {
      const { user: updated } = await accountApi.changePassword(values);
      queryClient.setQueryData(sessionQuery.queryKey, updated);
      form.reset(EMPTY);
      toast({ title: 'Password changed', description: 'Other devices have been signed out.', tone: 'success' });
      announce('Password changed. Other devices have been signed out.');
    },
  });

  return (
    <AccountSection
      title={user.hasPassword ? 'Change password' : 'Add a password'}
      description={
        user.hasPassword
          ? 'Changing your password signs you out on every other device.'
          : 'You sign in with Google. Adding a password lets you sign in with your email too.'
      }
    >
      <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5">
        <FormAlert message={form.formError} alertRef={form.formErrorRef} />
        {user.hasPassword ? (
          <PasswordField field={form.field('currentPassword')} label="Current password" autoComplete="current-password" required />
        ) : null}
        <PasswordField
          field={form.field('newPassword')}
          label="New password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          autoComplete="new-password"
          required
        />
        <PasswordField field={form.field('confirmPassword')} label="Confirm new password" autoComplete="new-password" required />
        <div>
          <Button type="submit" variant="primary" pending={form.submitting} pendingLabel="Saving…">
            {user.hasPassword ? 'Change password' : 'Add password'}
          </Button>
        </div>
      </form>
    </AccountSection>
  );
}
