import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

interface ShortcutHandler {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  handler: () => void;
  description: string;
}

export const useKeyboardShortcuts = (shortcuts: ShortcutHandler[]) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if event.key is defined before accessing toLowerCase
      if (!event.key) return;
      
      for (const shortcut of shortcuts) {
        const ctrlOrCmd = event.ctrlKey || event.metaKey;
        
        if (
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          (!shortcut.ctrlKey || ctrlOrCmd) &&
          (!shortcut.shiftKey || event.shiftKey)
        ) {
          event.preventDefault();
          shortcut.handler();
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts]);
};

export const useGlobalShortcuts = (onOpenSearch?: () => void) => {
  const navigate = useNavigate();

  const shortcuts: ShortcutHandler[] = [
    {
      key: "k",
      ctrlKey: true,
      handler: () => {
        if (onOpenSearch) {
          onOpenSearch();
        }
      },
      description: "Sök",
    },
    {
      key: "h",
      ctrlKey: true,
      handler: () => navigate("/"),
      description: "Gå till Dashboard",
    },
    {
      key: "p",
      ctrlKey: true,
      handler: () => navigate("/properties"),
      description: "Gå till Fastigheter",
    },
    {
      key: "w",
      ctrlKey: true,
      handler: () => navigate("/work-orders"),
      description: "Gå till Arbetsordrar",
    },
    {
      key: "m",
      ctrlKey: true,
      handler: () => navigate("/components"),
      description: "Gå till Komponenter",
    },
    {
      key: "o",
      ctrlKey: true,
      handler: () => navigate("/operations"),
      description: "Gå till Drift",
    },
  ];

  useKeyboardShortcuts(shortcuts);

  return shortcuts;
};
