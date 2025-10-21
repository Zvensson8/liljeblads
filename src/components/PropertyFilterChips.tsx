import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface Filter {
  id: string;
  label: string;
  value: any;
}

interface PropertyFilterChipsProps {
  filters: Filter[];
  onRemoveFilter: (filterId: string) => void;
  onClearAll: () => void;
}

export const PropertyFilterChips = ({ filters, onRemoveFilter, onClearAll }: PropertyFilterChipsProps) => {
  if (filters.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap animate-slide-in-right">
      <span className="text-sm text-muted-foreground">Aktiva filter:</span>
      {filters.map((filter) => (
        <Badge
          key={filter.id}
          variant="secondary"
          className="gap-1 cursor-pointer hover:bg-secondary/80 transition-colors animate-scale-in"
          onClick={() => onRemoveFilter(filter.id)}
        >
          {filter.label}
          <X className="h-3 w-3" />
        </Badge>
      ))}
      {filters.length > 1 && (
        <button
          onClick={onClearAll}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
        >
          Rensa alla
        </button>
      )}
    </div>
  );
};
