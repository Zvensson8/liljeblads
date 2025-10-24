import { Progress } from "@/components/ui/progress";

interface TodoProgressBarProps {
  completed: number;
  total: number;
}

export function TodoProgressBar({ completed, total }: TodoProgressBarProps) {
  if (total === 0) return null;

  const percentage = Math.round((completed / total) * 100);

  const getProgressColor = () => {
    if (percentage === 100) return "bg-green-500";
    if (percentage >= 67) return "bg-blue-500";
    if (percentage >= 34) return "bg-amber-500";
    return "bg-orange-500";
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{completed} av {total} klara</span>
        <span>{percentage}%</span>
      </div>
      <Progress 
        value={percentage} 
        className="h-2"
      />
    </div>
  );
}
