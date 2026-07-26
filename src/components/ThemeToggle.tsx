import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface ThemeToggleProps {
  collapsed?: boolean;
}

export function ThemeToggle({ collapsed = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          onClick={toggleTheme}
          className={`w-full ${collapsed ? 'px-2' : 'justify-start'}`}
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
          {!collapsed && (
            <span className="ml-3">
              {theme === "dark" ? "Ljust läge" : "Mörkt läge"}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {theme === "dark" ? "Byt till ljust läge" : "Byt till mörkt läge"}
      </TooltipContent>
    </Tooltip>
  );
}
