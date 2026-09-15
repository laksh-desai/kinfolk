import { planSetFocus } from '@kinfolk/shared/relatives/planRelationshipEdits';
import type { Person } from '@kinfolk/shared/schemas/person';
import type { TreeDto } from '@kinfolk/shared/schemas/tree';
import { Link } from 'react-router-dom';
import { Button, buttonClasses } from '../../../components/Button';
import { Icon } from '../../../components/Icon';
import { useCanvasStore, useCollapsed } from '../../../canvas/useCanvasStore';
import { commitWithUndo } from '../editing/changeQueue';
import { canEditTree } from '../treePermissions';
import { usePersonDialogs } from './personDialogStore';

interface PersonActionsProps {
  tree: TreeDto;
  person: Person;
  name: string;
  isFocus: boolean;
  focusId: string | null;
  hasDescendants: boolean;
}

export const PRIMITIVES = [
  { relation: 'parent', label: 'Add parent' },
  { relation: 'partner', label: 'Add partner' },
  { relation: 'child', label: 'Add child' },
  { relation: 'sibling', label: 'Add sibling' },
] as const;

/**
 * Everything you can do with a person, always visible in the panel (SPEC §4.1: the four
 * primitives are never hidden or conditional). Viewers see only what doesn't change the tree.
 */
export function PersonActions({ tree, person, name, isFocus, focusId, hasDescendants }: PersonActionsProps) {
  const editable = canEditTree(tree);
  const base = `/trees/${tree.id}/people/${person.id}`;
  const collapsed = useCollapsed(tree.id).includes(person.id);
  const toggleCollapsed = useCanvasStore((state) => state.toggleCollapsed);
  const openDelete = usePersonDialogs((state) => state.openDelete);
  const compareWith = focusId && focusId !== person.id ? focusId : '';

  return (
    <div className="flex flex-col gap-4 border-t border-line px-5 py-4">
      {editable ? (
        <section aria-labelledby="add-relative-heading" className="flex flex-col gap-2">
          <h3 id="add-relative-heading" className="text-base font-semibold">
            Add a relative of {name}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {PRIMITIVES.map((primitive) => (
              <Link key={primitive.relation} to={`${base}/add/${primitive.relation}`} className={buttonClasses('secondary', 'justify-start px-3')}>
                <Icon name="user-plus" />
                {primitive.label}
              </Link>
            ))}
          </div>
          <Link to={`${base}/add`} className={buttonClasses('ghost', 'justify-start px-3')}>
            <Icon name="users" />
            More relatives — grandparent, cousin, in-law…
          </Link>
        </section>
      ) : null}
      <section aria-label={`Other actions for ${name}`} className="flex flex-wrap gap-2">
        {editable ? (
          <>
            <Link to={`${base}/edit`} className={buttonClasses('primary')}>
              <Icon name="pencil" />
              Edit details
            </Link>
            <Link to={`${base}/relationships`} className={buttonClasses('secondary')}>
              <Icon name="link" />
              Relationships
            </Link>
            {!isFocus ? (
              <Button
                icon="target"
                onClick={() => void commitWithUndo(tree.id, planSetFocus(person.id), `Made ${name} the focus person`, `Relationships are now shown relative to ${name}.`).catch(() => undefined)}
              >
                Set as focus
              </Button>
            ) : null}
          </>
        ) : null}
        <Link to={`/trees/${tree.id}/compare?a=${person.id}${compareWith ? `&b=${compareWith}` : ''}`} className={buttonClasses('secondary')}>
          <Icon name="compare" />
          Compare
        </Link>
        {hasDescendants || collapsed ? (
          <Button icon={collapsed ? 'expand' : 'collapse'} onClick={() => toggleCollapsed(tree.id, person.id)}>
            {collapsed ? 'Show descendants' : 'Hide descendants'}
          </Button>
        ) : null}
        {editable ? (
          <>
            <Link to={`${base}/invite`} className={buttonClasses('secondary')}>
              <Icon name="mail" />
              Invite to Kinfolk
            </Link>
            <Link to={`${base}/merge`} className={buttonClasses('secondary')}>
              <Icon name="merge" />
              Merge with…
            </Link>
            <Button variant="danger-quiet" icon="trash" onClick={() => openDelete(person.id)}>
              Delete
            </Button>
          </>
        ) : null}
      </section>
    </div>
  );
}
