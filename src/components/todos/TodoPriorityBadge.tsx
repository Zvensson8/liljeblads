import { Badge } from "@/components/ui/badge";
import { AlertCircle, Circle } from "lucide-react";

interface TodoPriorityBadgeProps {
  priority: 'low' | 'medium' | 'high' | 'critical';
  className?: string;
}

export function TodoPriorityBadge({ priority, className }: TodoPriorityBadgeProps) {
  const config = {
    low: {
      label: "Låg",
      variant: "outline" as const,
      icon: Circle,
      className: "border-primary/30 text-primary",
    },
    medium: {
      label: "Medel",
      variant: "secondary" as const,
      icon: Circle,
      className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    },
    high: {
      label: "Hög",
      variant: "default" as const,
      icon: AlertCircle,
      className: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
    },
    critical: {
      label: "Kritisk",
      variant: "destructive" as const,
      icon: AlertCircle,
      className: "bg-destructive/10 text-destructive border-destructive/20",
    },
  };

  const { label, variant, icon: Icon, className: priorityClassName } = config[priority];

  return (
    <Badge variant={variant} className={`${priorityClassName} ${className || ""}`}>
      <Icon className="h-3 w-3 mr-1" />
      {label}
    </Badge>
  );
}
