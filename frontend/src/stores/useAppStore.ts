import { create } from "zustand";

export type AppState = {
  selectedDocId: number | null;
  setSelectedDocId: (id: number | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  selectedDocId: null,
  setSelectedDocId: (id) => set({ selectedDocId: id }),
}));

