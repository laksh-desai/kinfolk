import * as Tooltip from '@radix-ui/react-tooltip';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { ConfirmDialog } from './ConfirmDialog';

function Harness({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [open, setOpen] = useState(true);
  return (
    <Tooltip.Provider>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete “Rao family”?"
        confirmLabel="Delete tree"
        typeToConfirm={{ text: 'Rao family', label: 'Type the tree name, Rao family, to confirm' }}
        onConfirm={onConfirm}
      >
        <p>This deletes 42 people.</p>
      </ConfirmDialog>
    </Tooltip.Provider>
  );
}

describe('ConfirmDialog with type-to-confirm', () => {
  it('refuses to run the action until the exact text is typed, and says why', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Delete tree' }));
    expect(onConfirm).not.toHaveBeenCalled();
    const input = screen.getByLabelText('Type the tree name, Rao family, to confirm');
    expect(input).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('Type “Rao family” exactly to confirm.');

    await user.type(input, 'Rao famil');
    await user.keyboard('{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(input, 'y');
    await user.click(screen.getByRole('button', { name: 'Delete tree' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the dialog open and shows the failure when the action fails', async () => {
    const user = userEvent.setup();
    render(<Harness onConfirm={() => Promise.reject(new Error('We couldn’t delete the tree. Please try again.'))} />);
    await user.type(screen.getByLabelText(/to confirm/), 'Rao family');
    await user.click(screen.getByRole('button', { name: 'Delete tree' }));
    expect(await screen.findByText('We couldn’t delete the tree. Please try again.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('opens with focus in the confirmation field, not on the close button (which would pop its tooltip)', async () => {
    render(<Harness onConfirm={() => Promise.resolve()} />);
    await waitFor(() => expect(screen.getByLabelText('Type the tree name, Rao family, to confirm')).toHaveFocus());
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('opens a plain destructive confirmation with focus on Cancel, the safe choice', async () => {
    render(
      <Tooltip.Provider>
        <ConfirmDialog open onOpenChange={() => undefined} title="Remove photo?" confirmLabel="Remove" onConfirm={() => undefined}>
          <p>The photo will be deleted.</p>
        </ConfirmDialog>
      </Tooltip.Provider>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
  });

  it('is labelled, closable by a named button, and axe-clean', async () => {
    render(<Harness onConfirm={() => Promise.resolve()} />);
    expect(screen.getByRole('dialog', { name: 'Delete “Rao family”?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    await expectNoAxeViolations(document.body, { isolatedComponent: true });
  });
});
