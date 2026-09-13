import type { UIMatch } from 'react-router-dom';

export interface RouteHandle {
  /** Every route declares a title; the document title is "<title> · Kinfolk". */
  title: string | ((match: UIMatch<unknown, RouteHandle>) => string);
}

export function titleForMatches(matches: Array<UIMatch<unknown, unknown>>): string {
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index] as UIMatch<unknown, RouteHandle | undefined>;
    const title = match.handle?.title;
    if (title) {
      const text = typeof title === 'function' ? title(match as UIMatch<unknown, RouteHandle>) : title;
      return text ? `${text} · Kinfolk` : 'Kinfolk';
    }
  }
  return 'Kinfolk';
}
