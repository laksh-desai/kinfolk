import { Icon } from '../../../components/Icon';
import { Menu, MenuItem, MenuSeparator } from '../../../components/Menu';

interface TreeSettingsMenuProps {
  treeName: string;
  onRename: () => void;
  onDelete: () => void;
  onLinkRequests: () => void;
}

/** Owner-only tree actions. Rendered only for the owner, so nobody sees an action they can't take. */
export function TreeSettingsMenu({ treeName, onRename, onDelete, onLinkRequests }: TreeSettingsMenuProps) {
  return (
    <Menu
      trigger={
        <button type="button" aria-label={`Settings for ${treeName}`} className="inline-flex size-11 items-center justify-center rounded-control text-ink hover:bg-sunken">
          <Icon name="more" />
        </button>
      }
      label={`Settings for ${treeName}`}
      labelHidden
    >
      <MenuItem icon="pencil" onSelect={onRename}>
        Rename tree
      </MenuItem>
      <MenuItem icon="link" onSelect={onLinkRequests}>
        Link requests
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon="trash" tone="danger" onSelect={onDelete}>
        Delete this tree…
      </MenuItem>
    </Menu>
  );
}
