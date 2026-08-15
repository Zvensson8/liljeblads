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

function methodLabel(method: string): string {
  switch (method) {
    case 'prior':
      return 'typantagande';
    case 'hybrid':
      return 'typ + historik';
    case 'mle':
      return 'anpassad till felhistorik';
    case 'rank-regression':
      return 'anpassad till felhistorik';
    default:
      return method;
  }
}

function confidenceLabel(c: string): string {
  if (c === 'high') return 'hög';
  if (c === 'medium') return 'medel';
  if (c === 'low') return 'låg';
  return c;
}

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
        <TooltipContent className="max-w-xs space-y-1.5 text-sm">
          <p className="font-medium">{risk.recommendation}</p>
          <p className="text-muted-foreground">
            Risk {risk.riskScore} av 100 är felsannolikhet nu, räknad i Liljeblads
            med Weibull (installationsår, typens livslängd, akuta fel).
          </p>
          <p className="text-muted-foreground">
            Ålder {risk.ageYears.toFixed(1)} år · {risk.acuteCount} akuta fel ·
            tillförlitlighet {(risk.reliability * 100).toFixed(1)} %
          </p>
          {risk.remainingB10Years != null && (
            <p className="text-muted-foreground">
              B10 {risk.remainingB10Years.toFixed(1)} år = tid tills ca 10 % av
              liknande enheter förväntas ha fått ett första fel. Inte samma sak
              som återstående livslängd
              {risk.medianLifeYears != null
                ? ` (median ca ${risk.medianLifeYears.toFixed(0)} år).`
                : '.'}
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            Antagen livslängd η={risk.params.scale.toFixed(0)} år · form β=
            {risk.params.shape.toFixed(2)} ({methodLabel(risk.params.method)}) ·
            konfidens {confidenceLabel(risk.confidence)}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
