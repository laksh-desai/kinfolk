import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Icon } from '../../../components/Icon';

const itemClass = 'flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-md px-3 text-base outline-none data-[highlighted]:bg-sunken';

interface TreeSettingsMenuProps {
  treeName: string;
  onRename: () => void;
  onDelete: () => void;
  onLinkRequests: () => void;
}

/** Owner-only tree actions. Rendered only for the owner, so nobody sees an action they can't take. */
export function TreeSettingsMenu({ treeName, onRename, onDelete, onLinkRequests }: TreeSettingsMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label={`Settings for ${treeName}`} className="inline-flex size-11 items-center justify-center rounded-control text-ink hover:bg-sunken">
        <Icon name="more" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={12} className="z-50 min-w-56 max-w-[calc(100vw-1.5rem)] rounded-card border border-line bg-surface p-1.5 shadow-card">
          <DropdownMenu.Item className={`${itemClass} text-ink`} onSelect={onRename}>
            <Icon name="pencil" /> Rename tree
          </DropdownMenu.Item>
          <DropdownMenu.Item className={`${itemClass} text-ink`} onSelect={onLinkRequests}>
            <Icon name="link" /> Link requests
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={`${itemClass} text-danger`} onSelect={onDelete}>
            <Icon name="trash" /> Delete this tree…
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
