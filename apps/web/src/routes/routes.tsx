import { fullName } from '@kinfolk/shared/graph/displayName';
import { RELATIONS } from '@kinfolk/shared/relatives/planAddRelative';
import type { RouteObject, UIMatch } from 'react-router-dom';
import { treeGraphQuery, type TreeGraphResponse } from '../features/tree/treeQueries';
import { queryClient } from '../lib/queryClient';
import { AppShell } from './AppShell';
import { redirectIfSignedInLoader, requireUserLoader, rootLoader } from './guards';
import { NotFoundRoute } from './NotFoundRoute';
import { RootLayout } from './RootLayout';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import type { RouteHandle } from './routeHandle';
import { SplashScreen } from './SplashScreen';

const handle = (title: RouteHandle['title']): RouteHandle => ({ title });

function treeData(data: unknown): TreeGraphResponse | null {
  return data && typeof data === 'object' && 'tree' in data && 'graph' in data ? (data as TreeGraphResponse) : null;
}

/**
 * The tree as it is now: the query cache (updated by edits and renames) before the loader's
 * snapshot, so titles follow a rename or a person's new name without a reload.
 */
function currentTree(matches: Match[]): TreeGraphResponse | null {
  const loaded = treeData(matches.find((candidate) => treeData(candidate.data))?.data);
  if (!loaded) return null;
  return treeData(queryClient.getQueryData(treeGraphQuery(loaded.tree.id).queryKey)) ?? loaded;
}

type Match = UIMatch<unknown, unknown>;

/** Titles for screens about one person: "Edit Ravi’s details · Sharma family". */
function personTitle(build: (name: string, match: Match, data: TreeGraphResponse | null) => string): RouteHandle {
  return handle((match, matches) => {
    const data = currentTree(matches);
    const nameFor = (id: string | undefined) => {
      const person = data?.graph.people.find((candidate) => candidate.id === id);
      return person ? fullName(person) || 'Unnamed person' : 'Person';
    };
    const title = build(nameFor(match.params.personId), match, data);
    return data ? `${title} · ${data.tree.name}` : title;
  });
}

function treeTitle(title: string): RouteHandle {
  return handle((_match, matches) => {
    const data = currentTree(matches);
    return data ? `${title} · ${data.tree.name}` : title;
  });
}

/**
 * Every screen is addressable by URL and restorable from it alone. Page modules are split per
 * route (lazy); guards are not, so auth is resolved before any page code even downloads.
 */
export const routes: RouteObject[] = [
  {
    id: 'root',
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    loader: rootLoader,
    HydrateFallback: SplashScreen,
    children: [
      {
        loader: redirectIfSignedInLoader,
        errorElement: <RouteErrorBoundary />,
        children: [
          { path: 'login', handle: handle('Sign in'), lazy: () => import('../features/auth/SignInRoute') },
          { path: 'signup', handle: handle('Create your account'), lazy: () => import('../features/auth/SignUpRoute') },
          {
            path: 'forgot-password',
            handle: handle('Reset your password'),
            lazy: () => import('../features/auth/ForgotPasswordRoute'),
          },
          {
            path: 'forgot-password/verify',
            handle: handle('Enter your code'),
            lazy: () => import('../features/auth/VerifyCodeRoute'),
          },
          {
            path: 'forgot-password/reset',
            handle: handle('Choose a new password'),
            lazy: () => import('../features/auth/ResetPasswordRoute'),
          },
        ],
      },
      {
        id: 'app',
        loader: requireUserLoader,
        element: <AppShell />,
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            index: true,
            handle: handle('Your family trees'),
            errorElement: <RouteErrorBoundary />,
            lazy: () => import('../features/dashboard/DashboardRoute'),
          },
          {
            path: 'account',
            handle: handle('Account'),
            errorElement: <RouteErrorBoundary />,
            lazy: () => import('../features/account/AccountRoute'),
          },
          {
            path: 'trees/:treeId',
            handle: handle((match, matches) => currentTree(matches)?.tree.name ?? treeData(match.data)?.tree.name ?? 'Family tree'),
            errorElement: <RouteErrorBoundary />,
            lazy: () => import('../features/tree/TreeRoute'),
            children: [
              { path: 'add', handle: treeTitle('Add a person'), errorElement: <RouteErrorBoundary />, lazy: () => import('../features/tree/people/AddPersonRoute') },
              { path: 'compare', handle: treeTitle('Compare two people'), errorElement: <RouteErrorBoundary />, lazy: () => import('../features/tree/compare/CompareRoute') },
              { path: 'needs-detail', handle: treeTitle('Needs detail'), errorElement: <RouteErrorBoundary />, lazy: () => import('../features/tree/people/NeedsDetailRoute') },
              {
                path: 'people/:personId',
                handle: personTitle((name) => name),
                errorElement: <RouteErrorBoundary />,
                lazy: () => import('../features/tree/PersonPanelRoute'),
              },
              {
                path: 'people/:personId/add',
                handle: personTitle((name) => `Add a relative of ${name}`),
                errorElement: <RouteErrorBoundary />,
                lazy: () => import('../features/tree/people/RelationPickerRoute'),
              },
              {
                path: 'people/:personId/add/:relation',
                handle: personTitle((name, match) => {
                  const relation = RELATIONS.find((entry) => entry.key === match.params.relation);
                  return relation ? `Add ${relation.label.toLowerCase()} · ${name}` : `Add a relative of ${name}`;
                }),
                errorElement: <RouteErrorBoundary />,
                lazy: () => import('../features/tree/people/AddRelativeRoute'),
              },
              {
                path: 'people/:personId/edit',
                handle: personTitle((name) => `Edit ${name}’s details`),
                errorElement: <RouteErrorBoundary />,
                lazy: () => import('../features/tree/people/EditPersonRoute'),
              },
              {
                path: 'people/:personId/relationships',
                handle: personTitle((name) => `${name}’s relationships`),
                errorElement: <RouteErrorBoundary />,
                lazy: () => import('../features/tree/people/RelationshipsRoute'),
              },
              {
                path: 'people/:personId/merge',
                handle: personTitle((name) => `Merge ${name} with someone`),
                errorElement: <RouteErrorBoundary />,
                lazy: () => import('../features/tree/people/MergePickerRoute'),
              },
              {
                path: 'people/:personId/merge/:otherId',
                handle: personTitle((name, match, data) => {
                  const other = data?.graph.people.find((candidate) => candidate.id === match.params.otherId);
                  return `Merge ${name} and ${other ? fullName(other) || 'Unnamed person' : 'someone'}`;
                }),
                errorElement: <RouteErrorBoundary />,
                lazy: () => import('../features/tree/people/MergeRoute'),
              },
            ],
          },
        ],
      },
      { path: '*', handle: handle('Page not found'), element: <NotFoundRoute /> },
    ],
  },
];
