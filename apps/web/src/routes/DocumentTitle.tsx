import { useEffect, useSyncExternalStore } from 'react';
import { useMatches } from 'react-router-dom';
import { queryClient } from '../lib/queryClient';
import { titleForMatches } from './routeHandle';

// Titles can depend on cached data (a renamed tree, a renamed person), so re-read them when the cache changes.
const subscribe = (onChange: () => void) => queryClient.getQueryCache().subscribe(onChange);

export function DocumentTitle() {
  const matches = useMatches();
  const title = useSyncExternalStore(subscribe, () => titleForMatches(matches));
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
}
