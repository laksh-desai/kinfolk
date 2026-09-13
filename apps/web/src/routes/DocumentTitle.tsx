import { useEffect } from 'react';
import { useMatches } from 'react-router-dom';
import { titleForMatches } from './routeHandle';

export function DocumentTitle() {
  const matches = useMatches();
  const title = titleForMatches(matches);
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
}
