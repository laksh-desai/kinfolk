import { updateProfileSchema } from '@kinfolk/shared/schemas/account';
import { Button } from '../../components/Button';
import { FormAlert } from '../../components/FormAlert';
import { PasswordField } from '../../components/PasswordField';
import { TextField } from '../../components/TextField';
import { announce } from '../../lib/announcer';
import { queryClient } from '../../lib/queryClient';
import { toast } from '../../lib/toast';
import { useForm } from '../../lib/useForm';
import { sessionQuery, useCurrentUser } from '../auth/sessionQuery';
import { accountApi } from './accountApi';
import { AccountSection } from './AccountSection';

export function ProfileSection() {
  const user = useCurrentUser();
  const form = useForm({
    schema: updateProfileSchema,
    initialValues: { firstName: user.firstName, lastName: user.lastName, email: user.email, currentPassword: '' },
    labels: { firstName: 'First name', lastName: 'Last name', email: 'Email', currentPassword: 'Current password' },
    idPrefix: 'profile',
    onSubmit: async (values) => {
      const { user: updated } = await accountApi.updateProfile(values);
      queryClient.setQueryData(sessionQuery.queryKey, updated);
      form.reset({ firstName: updated.firstName, lastName: updated.lastName, email: updated.email, currentPassword: '' });
      toast({ title: 'Profile saved', tone: 'success' });
      announce('Profile saved');
    },
  });
  const emailChanged = String(form.values.email ?? '').trim().toLowerCase() !== user.email;

  return (
    <AccountSection title="Profile">
      <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-5">
        <FormAlert message={form.formError} alertRef={form.formErrorRef} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField field={form.field('firstName')} label="First name" autoComplete="given-name" required />
          <TextField field={form.field('lastName')} label="Last name" autoComplete="family-name" required />
        </div>
        <TextField field={form.field('email')} label="Email" type="email" autoComplete="email" required />
        {emailChanged && user.hasPassword ? (
          <PasswordField
            field={form.field('currentPassword')}
            label="Current password"
            hint="Needed to change the email you sign in with."
            autoComplete="current-password"
            required
          />
        ) : null}
        <div>
          <Button type="submit" variant="primary" pending={form.submitting} pendingLabel="Saving…">
            Save profile
          </Button>
        </div>
      </form>
    </AccountSection>
  );
}
