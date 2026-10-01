import { planSetFocus } from '@kinfolk/shared/relatives/planRelationshipEdits';
import { commitWithUndo } from './changeQueue';

/** Make someone the focus person — the one every relationship label is relative to — undoably. */
export function setFocusPerson(treeId: string, personId: string, name: string): void {
  void commitWithUndo(treeId, planSetFocus(personId), `Made ${name} the focus person`, `Relationships are now shown relative to ${name}.`).catch(() => undefined);
}
