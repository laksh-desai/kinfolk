import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Menu, MenuItem, MenuNote, MenuSeparator } from '../components/Menu';
import { authApi } from '../features/auth/authApi';
import { sessionQuery, useCurrentUser } from '../features/auth/sessionQuery';
import { Wordmark } from '../components/Brand';
import { cx } from '../lib/cx';
import { isDarkTheme, setThemePreference, useThemePreference } from '../lib/preferences';
import { queryClient } from '../lib/queryClient';
import { toast } from '../lib/toast';

const NAV_ITEMS = [
  { to: '/', label: 'Family trees', icon: 'tree' as const, end: true },
  { to: '/events', label: 'Key events', icon: 'calendar' as const, end: false },
];

export function AppShell() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  // The quick toggle offers whichever theme is not showing; "match this device" stays on /account.
  const dark = isDarkTheme(useThemePreference());

  const signOut = async () => {
    try {
      await authApi.signOut();
    } catch {
      // Even if the network call fails, clear local state: the cookie is httpOnly and expires.
    }
    queryClient.clear();
    queryClient.setQueryData(sessionQuery.queryKey, null);
    toast({ title: 'You’re signed out', tone: 'neutral' });
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only-focusable fixed left-3 top-3 z-[70] rounded-control bg-accent px-4 py-2 font-semibold text-on-accent">
        Skip to main content
      </a>
      {/* Exactly 4rem tall, border included: the tree page sizes itself to the window below it. */}
      <header className="sticky top-0 z-30 box-border h-16 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-full max-w-screen-2xl items-center gap-4 px-4 sm:px-6">
          <Wordmark />
          <nav aria-label="Main" className="ml-2 hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cx(
                    'inline-flex min-h-11 items-center gap-2 rounded-control px-3 font-semibold',
                    isActive ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-sunken hover:text-ink',
                  )
                }
              >
                <Icon name={item.icon} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Menu
              trigger={
                <button type="button" aria-label={`Account menu for ${fullName}`} className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 hover:bg-sunken">
                  <Avatar name={fullName} src={user.avatarUrl} size="sm" />
                  <span className="hidden max-w-40 truncate font-semibold sm:inline">{user.firstName}</span>
                  <Icon name="chevron-down" className="size-4" />
                </button>
              }
              label={`Account menu for ${fullName}`}
              labelHidden
            >
              <MenuNote>
                Signed in as <span className="block truncate font-semibold text-ink">{user.email}</span>
              </MenuNote>
              <MenuSeparator />
              <MenuItem icon="tree" className="md:hidden" onSelect={() => navigate('/')}>
                Family trees
              </MenuItem>
              <MenuItem icon="calendar" className="md:hidden" onSelect={() => navigate('/events')}>
                Key events
              </MenuItem>
              <MenuItem icon="user" onSelect={() => navigate('/account')}>
                Account
              </MenuItem>
              <MenuItem icon={dark ? 'sun' : 'moon'} onSelect={() => setThemePreference(dark ? 'light' : 'dark')}>
                {dark ? 'Switch to light theme' : 'Switch to dark theme'}
              </MenuItem>
              <MenuItem icon="log-out" onSelect={() => void signOut()}>
                Sign out
              </MenuItem>
            </Menu>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
