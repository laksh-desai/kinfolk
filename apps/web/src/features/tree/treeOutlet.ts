import type { TreeDto } from '@kinfolk/shared/schemas/tree';
import { useOutletContext } from 'react-router-dom';
import type { TreeView } from './useTreeView';

export interface TreeOutletContext {
  view: TreeView;
  tree: TreeDto;
  onSelect: (personId: string | null, options?: { openPanel?: boolean }) => void;
}

export function useTreeOutlet(): TreeOutletContext {
  return useOutletContext<TreeOutletContext>();
}
