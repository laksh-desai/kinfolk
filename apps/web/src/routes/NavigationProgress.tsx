import { useNavigation } from 'react-router-dom';

/**
 * A thin bar at the top of the window while the next page's data loads. Route loaders keep the
 * old page on screen until data arrives; without this, a click on a slow connection looks
 * like it did nothing.
 */
export function NavigationProgress() {
  const navigation = useNavigation();
  if (navigation.state !== 'loading') return null;
  // Wrapped in a labelled region: it renders outside the page's landmarks, and all content must
  // be inside one (axe "region").
  return (
    <section aria-label="Page loading">
      <div role="progressbar" aria-label="Opening page" className="fixed inset-x-0 top-0 z-[80] h-1 overflow-hidden bg-accent-soft">
        <div className="h-full w-1/3 animate-[kf-progress_1.2s_ease-in-out_infinite] bg-accent" />
      </div>
    </section>
  );
}
