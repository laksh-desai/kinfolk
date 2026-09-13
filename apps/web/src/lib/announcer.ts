import { create } from 'zustand';

interface AnnouncerState {
  polite: string;
  assertive: string;
  announce: (message: string, politeness?: 'polite' | 'assertive') => void;
}

/**
 * Feeds the two app-wide live regions rendered by <LiveRegions>. Re-announcing the same text
 * works because the region is cleared first.
 */
export const useAnnouncer = create<AnnouncerState>((set) => ({
  polite: '',
  assertive: '',
  announce: (message, politeness = 'polite') => {
    set({ [politeness]: '' } as Pick<AnnouncerState, 'polite'>);
    setTimeout(() => set({ [politeness]: message } as Pick<AnnouncerState, 'polite'>), 50);
  },
}));

export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
  useAnnouncer.getState().announce(message, politeness);
}
