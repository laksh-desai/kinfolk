export interface Shortcut {
  /** Each key as shown on a keycap; alternatives (Mac, Windows) are separate entries. */
  keys: readonly string[];
  label: string;
}

/** Every keyboard shortcut on the tree page, in the order the help dialog lists them. */
export const SHORTCUTS: readonly Shortcut[] = [
  { keys: ['↑', '↓', '←', '→'], label: 'Move between relatives: up to a parent, down to a child, along a generation' },
  { keys: ['Enter'], label: 'Open the selected person’s details' },
  { keys: ['Shift', 'F10'], label: 'Actions for the selected person (the Menu key works too)' },
  { keys: ['/'], label: 'Find a person' },
  { keys: ['+', '−'], label: 'Zoom in and out' },
  { keys: ['F'], label: 'Fit the whole tree on screen' },
  { keys: ['Esc'], label: 'Clear the selection, or close the search' },
  { keys: ['⌘Z', 'Ctrl+Z'], label: 'Undo the last change' },
  { keys: ['⌘⇧Z', 'Ctrl+Y'], label: 'Redo' },
  { keys: ['?'], label: 'Show this list' },
];
