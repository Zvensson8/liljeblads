import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export interface RecentlyVisitedItem {
  id: string;
  type: "property" | "component" | "project" | "work_order";
  title: string;
  path: string;
  timestamp: number;
}

const STORAGE_KEY = "recently-visited";
const MAX_ITEMS = 10;

export function useRecentlyVisited() {
  const location = useLocation();

  useEffect(() => {
    // Track page visits automatically based on route
    const pathSegments = location.pathname.split("/").filter(Boolean);
    
    if (pathSegments.length >= 2) {
      const type = pathSegments[0];
      const id = pathSegments[1];
      
      // Only track detail pages
      if (["properties", "components", "projects"].includes(type)) {
        // We'll add the item when we have the actual title
        // This will be called from the detail pages themselves
      }
    }
  }, [location]);

  const addRecentItem = (item: Omit<RecentlyVisitedItem, "timestamp">) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      let items: RecentlyVisitedItem[] = stored ? JSON.parse(stored) : [];
      
      // Remove existing item with same path
      items = items.filter((i) => i.path !== item.path);
      
      // Add new item at the beginning
      items.unshift({
        ...item,
        timestamp: Date.now(),
      });
      
      // Keep only MAX_ITEMS
      items = items.slice(0, MAX_ITEMS);
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error("Failed to save recent item:", error);
    }
  };

  const getRecentItems = (): RecentlyVisitedItem[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error("Failed to get recent items:", error);
      return [];
    }
  };

  const clearRecentItems = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear recent items:", error);
    }
  };

  return {
    addRecentItem,
    getRecentItems,
    clearRecentItems,
  };
}
