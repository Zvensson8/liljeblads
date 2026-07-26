import { Badge } from "@/components/ui/badge";

interface TodoCategoryBadgeProps {
  category: string | null;
}

export function TodoCategoryBadge({ category }: TodoCategoryBadgeProps) {
  if (!category) return null;

  const categoryColors: Record<string, string> = {
    "Brandskydd": "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    "Underhåll": "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    "Dokumentation": "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
    "Besiktning": "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  };

  const colorClass = categoryColors[category] || "bg-muted text-muted-foreground";

  return (
    <Badge variant="outline" className={colorClass}>
      {category}
    </Badge>
  );
}
