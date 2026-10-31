/**
 * Ephemeral UI state that must survive navigation but not a reload:
 * the post composer, open dialogs, and the mobile search sheet.
 *
 * Server data deliberately does not live here — that belongs to TanStack Query.
 */
import { create } from 'zustand';

export const useUIStore = create((set, get) => ({
  composerOpen: false,
  composerSeed: null,
  reportTarget: null,

  openComposer: (seed = null) => set({ composerOpen: true, composerSeed: seed }),
  closeComposer: () => set({ composerOpen: false, composerSeed: null }),

  openReport: (target) => set({ reportTarget: target }),
  closeReport: () => set({ reportTarget: null }),

  toggleComposer: () => (get().composerOpen ? get().closeComposer() : get().openComposer()),
}));
