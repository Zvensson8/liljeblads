import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  riskLevelColor,
  riskLevelLabel,
  type ComponentRiskResult,
} from '@/lib/componentRisk';
import { cn } from '@/lib/utils';

interface ComponentRiskBadgeProps {
  risk: ComponentRiskResult | undefined | null;
  /** Show numeric score next to label */
  showScore?: boolean;
  className?: string;
  compact?: boolean;
}

export function ComponentRiskBadge({
  risk,
  showScore = true,
  className,
  compact = false,
}: ComponentRiskBadgeProps) {
  if (!risk) {
    return (
      <Badge variant="outline" className={cn('text-muted-foreground', className)}>
        Risk: –
      </Badge>
    );
  }

  const label = riskLevelLabel(risk.riskLevel);
  const color = riskLevelColor(risk.riskLevel);

  const badge = (
    <Badge className={cn(color, 'border-0 font-medium', className)}>
      {compact ? (
        <>
          {label}
          {showScore ? ` ${risk.riskScore}` : ''}
        </>
      ) : (
        <>
          Risk: {label}
          {showScore ? ` (${risk.riskScore})` : ''}
        </>
      )}
    </Badge>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="max-w-xs space-y-1 text-sm">
          <p className="font-medium">{risk.recommendation}</p>
          <p className="text-muted-foreground">
            Ålder: {risk.ageYears.toFixed(1)} år · R(t) ={' '}
            {(risk.reliability * 100).toFixed(1)} % · Akuta:{' '}
            {risk.acuteCount}
          </p>
          {risk.remainingB10Years != null && (
            <p className="text-muted-foreground">
              Återstående B10 ≈ {risk.remainingB10Years.toFixed(1)} år
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            Weibull β={risk.params.shape.toFixed(2)}, η=
            {risk.params.scale.toFixed(1)} ({risk.params.method}) · Konfidens:{' '}
            {risk.confidence}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
