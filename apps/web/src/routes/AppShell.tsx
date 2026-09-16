import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { authApi } from '../features/auth/authApi';
import { sessionQuery, useCurrentUser } from '../features/auth/sessionQuery';
import { cx } from '../lib/cx';
import { queryClient } from '../lib/queryClient';
import { toast } from '../lib/toast';

const NAV_ITEMS = [
  { to: '/', label: 'Family trees', icon: 'tree' as const, end: true },
  { to: '/events', label: 'Key events', icon: 'calendar' as const, end: false },
];

const menuItemClass =
  'flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-md px-3 text-base text-ink outline-none data-[highlighted]:bg-sunken';

export function AppShell() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const fullName = `${user.firstName} ${user.lastName}`.trim();

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
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 font-serif text-xl font-semibold text-ink">
            <svg aria-hidden="true" viewBox="0 0 32 32" className="size-7 text-accent">
              <rect width="32" height="32" rx="7" fill="currentColor" />
              <path d="M16 7v6m0 0-6 5m6-5 6 5M10 18v5m12-5v5" stroke="var(--kf-surface)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            </svg>
            Kinfolk
          </Link>
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
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                aria-label={`Account menu for ${fullName}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 hover:bg-sunken"
              >
                <Avatar name={fullName} src={user.avatarUrl} size="sm" />
                <span className="hidden max-w-40 truncate font-semibold sm:inline">{user.firstName}</span>
                <Icon name="chevron-down" className="size-4" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  collisionPadding={12}
                  className="z-50 min-w-56 max-w-[calc(100vw-1.5rem)] rounded-card border border-line bg-surface p-1.5 shadow-card"
                >
                  <div className="px-3 py-2 text-sm text-ink-muted">
                    Signed in as <span className="block truncate font-semibold text-ink">{user.email}</span>
                  </div>
                  <DropdownMenu.Separator className="my-1 h-px bg-line" />
                  <DropdownMenu.Item className={cx(menuItemClass, 'md:hidden')} onSelect={() => navigate('/')}>
                    <Icon name="tree" /> Family trees
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className={cx(menuItemClass, 'md:hidden')} onSelect={() => navigate('/events')}>
                    <Icon name="calendar" /> Key events
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className={menuItemClass} onSelect={() => navigate('/account')}>
                    <Icon name="user" /> Account
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className={menuItemClass} onSelect={() => void signOut()}>
                    <Icon name="log-out" /> Sign out
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
