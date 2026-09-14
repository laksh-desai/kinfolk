import { useParams } from 'react-router-dom';
import { useTreeOutlet } from '../treeOutlet';
import { canEditTree } from '../treePermissions';
import { EditPersonForm } from './EditPersonForm';
import { PersonNotFound } from './PersonNotFound';
import { ReadOnlyPanel } from './ReadOnlyPanel';

/**
 * The full person form (SPEC §5.4), addressable at /trees/:treeId/people/:personId/edit. The
 * heading always says whose details are being edited (SPEC §6.2).
 */
export function Component() {
  const { personId = '' } = useParams();
  const { view, tree } = useTreeOutlet();
  const person = view.graph.people.find((candidate) => candidate.id === personId);
  if (!person) return <PersonNotFound treeId={tree.id} />;
  if (!canEditTree(tree)) return <ReadOnlyPanel tree={tree} personId={person.id} />;
  // Keyed by person so switching people starts a fresh form.
  return <EditPersonForm key={person.id} person={person} />;
}
