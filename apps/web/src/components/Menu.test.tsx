import * as Tooltip from '@radix-ui/react-tooltip';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { Menu, MenuItem, MenuNote, MenuSeparator } from './Menu';

function Example({ onRename = vi.fn(), onDelete = vi.fn() }: { onRename?: () => void; onDelete?: () => void }) {
  return (
    <Tooltip.Provider>
      <main>
        <Menu trigger={<button type="button">Open things</button>} label="Things to do" labelHidden>
        <MenuNote>Three things</MenuNote>
        <MenuItem icon="pencil" onSelect={onRename}>
          Rename
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon="trash" tone="danger" onSelect={onDelete}>
          Delete…
        </MenuItem>
        </Menu>
      </main>
    </Tooltip.Provider>
  );
}

describe('Menu', () => {
  it('is named by its label, not its trigger, and runs the chosen item', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<Example onDelete={onDelete} />);
    await user.click(screen.getByRole('button', { name: 'Open things' }));
    const menu = await screen.findByRole('menu', { name: 'Things to do' });
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Rename', 'Delete…']);
    expect(within(menu).getByText('Three things')).toBeInTheDocument();
    // The menu is portalled to the body, outside any landmark, as it is on every real screen.
    await expectNoAxeViolations(document.body, { isolatedComponent: true });
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete…' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('opens from the keyboard with the first item focused, and Escape returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Open things' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu', { name: 'Things to do' });
    await waitFor(() => expect(within(menu).getByRole('menuitem', { name: 'Rename' })).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
