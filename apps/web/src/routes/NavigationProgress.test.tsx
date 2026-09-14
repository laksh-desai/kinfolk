import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { mockApi, testUser } from '../test/mockApi';
import { renderApp } from '../test/renderApp';
import { seedResponse, TREE_ID } from '../test/treeFixtures';

describe('navigation feedback', () => {
  it('shows a progress indicator while a page is loading, so a click never looks like it did nothing', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockApi({
      'GET /api/auth/me': () => ({ body: { user: testUser } }),
      [`GET /api/trees/${TREE_ID}/graph`]: async () => {
        await gate;
        return { body: seedResponse().body };
      },
    });
    const { router } = await renderApp('/');
    await screen.findByRole('heading', { name: 'Welcome, Asha' });
    act(() => {
      void router.navigate(`/trees/${TREE_ID}`);
    });
    expect(await screen.findByRole('progressbar', { name: 'Opening page' })).toBeInTheDocument();
    // The bar is page content too: it must sit inside a landmark like everything else.
    await expectNoAxeViolations();
    act(() => release());
    await screen.findByRole('heading', { level: 1, name: 'Sharma family' });
    await waitFor(() => expect(screen.queryByRole('progressbar', { name: 'Opening page' })).not.toBeInTheDocument());
  }, 60_000);
});
