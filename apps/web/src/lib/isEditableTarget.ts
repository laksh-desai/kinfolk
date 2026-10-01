/**
 * Whether a key press landed somewhere that types: single-key shortcuts (`/`, `F`, `?`) and
 * the undo chords must leave those alone, or a slash in a search box would open the search.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest?.('input, textarea, select, [contenteditable="true"]'));
}
