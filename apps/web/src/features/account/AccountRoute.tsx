import { AppearanceSection } from './AppearanceSection';
import { AvatarSection } from './AvatarSection';
import { DeleteAccountSection } from './DeleteAccountSection';
import { PasswordSection } from './PasswordSection';
import { ProfileSection } from './ProfileSection';

export function Component() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="page-title">Account</h1>
      <p className="mt-2 text-lg text-ink-muted">Your profile, sign-in details, and data.</p>
      <div className="mt-8 flex flex-col gap-6">
        <AvatarSection />
        <ProfileSection />
        <PasswordSection />
        <AppearanceSection />
        <DeleteAccountSection />
      </div>
    </main>
  );
}
