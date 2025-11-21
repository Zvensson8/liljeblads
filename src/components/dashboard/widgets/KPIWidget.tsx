import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPIWidgetProps {
  title: string;
  value: number;
  prev?: number;
  subtitle?: string;
  icon: any;
  description: string;
  color: string;
  bgColor: string;
}

export const KPIWidget = ({ title, value, prev, subtitle, icon: Icon, description, color, bgColor }: KPIWidgetProps) => {
  const getTrendIcon = (current: number, previous: number | undefined) => {
    if (!previous || previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    if (Math.abs(change) < 1) return <Minus className="h-3 w-3 text-muted-foreground" />;
    if (change > 0) return <TrendingUp className="h-3 w-3 text-green-500" />;
    return <TrendingDown className="h-3 w-3 text-red-500" />;
  };

  const getTrendText = (current: number, previous: number | undefined) => {
    if (!previous || previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    if (Math.abs(change) < 1) return null;
    const sign = change > 0 ? "+" : "";
    return `${sign}${change.toFixed(0)}% från förra perioden`;
  };

  return (
    <Card className="h-full border-border/50 hover:shadow-[var(--shadow-elegant)] transition-all">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${bgColor}`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {title}
            </CardTitle>
          </div>
          {getTrendIcon(value, prev)}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold mb-2">{value}</div>
        {getTrendText(value, prev) && (
          <p className="text-xs text-muted-foreground mb-1">
            {getTrendText(value, prev)}
          </p>
        )}
        {subtitle && (
          <p className="text-sm text-muted-foreground mb-1">{subtitle}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  );
};
