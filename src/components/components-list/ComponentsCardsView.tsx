import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ComponentRiskBadge } from '@/components/ComponentRiskBadge';
import { getTypeDisplayName } from '@/lib/componentTypeLabels';
import { componentStatusClassName, componentStatusLabel } from '@/lib/componentLabels';
import { componentPath } from '@/lib/entityPaths';
import type { ComponentRiskResult } from '@/lib/componentRisk';

export interface ComponentCardItem {
  id: string;
  name: string;
  type: string;
  status: string;
  property_name?: string;
  installation_year: number | null;
}

interface ComponentsCardsViewProps {
  components: ComponentCardItem[];
  riskById: Map<string, ComponentRiskResult>;
  lastServiceById: Record<string, string>;
}

export function ComponentsCardsView({
  components,
  riskById,
  lastServiceById,
}: ComponentsCardsViewProps) {
  const navigate = useNavigate();

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {components.map((component) => {
        const risk = riskById.get(component.id);
        const lastService = lastServiceById[component.id];
        return (
          <Card
            key={component.id}
            className="group hover:border-primary/40 transition-colors cursor-pointer"
            onClick={() => navigate(componentPath(component.id))}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-lg group-hover:text-primary transition-colors">
                    {component.name}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {getTypeDisplayName(component.type)}
                  </CardDescription>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge className={componentStatusClassName(component.status)}>
                    {componentStatusLabel(component.status)}
                  </Badge>
                  {risk ? <ComponentRiskBadge risk={risk} compact /> : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">{component.property_name || 'Ej kopplad'}</span>
              </div>
              {component.installation_year && (
                <p className="text-sm text-muted-foreground">
                  Installerad {component.installation_year}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {lastService ? `Senaste service ${lastService}` : 'Ingen service registrerad'}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
