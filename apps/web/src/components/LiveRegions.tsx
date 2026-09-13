import { useAnnouncer } from '../lib/announcer';

/** App-wide live regions. Always in the DOM so screen readers are already listening. */
export function LiveRegions() {
  const polite = useAnnouncer((state) => state.polite);
  const assertive = useAnnouncer((state) => state.assertive);
  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live-polite">
        {polite}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only" data-testid="live-assertive">
        {assertive}
      </div>
    </>
  );
}
