import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserPreferencesState {
  selectedPropertyId: string | null;
  recentlyViewedProperties: string[];
  mapCenter: { lat: number; lng: number } | null;
  mapZoom: number;
  setSelectedProperty: (id: string | null) => void;
  addRecentlyViewed: (id: string) => void;
  setMapCenter: (center: { lat: number; lng: number }) => void;
  setMapZoom: (zoom: number) => void;
}

export const useUserPreferencesStore = create<UserPreferencesState>()(
  persist(
    (set) => ({
      selectedPropertyId: null,
      recentlyViewedProperties: [],
      mapCenter: null,
      mapZoom: 12,
      setSelectedProperty: (id) => set({ selectedPropertyId: id }),
      addRecentlyViewed: (id) =>
        set((state) => {
          const recent = [
            id,
            ...state.recentlyViewedProperties.filter((p) => p !== id),
          ].slice(0, 10);
          return { recentlyViewedProperties: recent };
        }),
      setMapCenter: (center) => set({ mapCenter: center }),
      setMapZoom: (zoom) => set({ mapZoom: zoom }),
    }),
    {
      name: 'user-preferences-storage',
    }
  )
);
