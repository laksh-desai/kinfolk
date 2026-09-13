import type { UIMatch } from 'react-router-dom';

type AnyMatch = UIMatch<unknown, unknown>;

export interface RouteHandle {
  /**
   * Every route declares a title; the document title is "<title> · Kinfolk". A function title
   * receives its own match and all current matches, so a child route can use a parent's data.
   */
  title: string | ((match: AnyMatch, matches: AnyMatch[]) => string);
}

export function titleForMatches(matches: AnyMatch[]): string {
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index] as UIMatch<unknown, RouteHandle | undefined>;
    const title = match.handle?.title;
    if (title) {
      let text = '';
      try {
        text = typeof title === 'function' ? title(match as AnyMatch, matches) : title;
      } catch {
        text = '';
      }
      return text ? `${text} · Kinfolk` : 'Kinfolk';
    }
  }
  return 'Kinfolk';
}
