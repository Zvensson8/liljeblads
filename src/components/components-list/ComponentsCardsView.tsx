import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ComponentRiskBadge } from '@/components/ComponentRiskBadge';
import { getTypeDisplayName } from '@/lib/componentTypeLabels';
import type { ComponentRiskResult } from '@/lib/componentRisk';

export interface ComponentCardItem {
  id: string;
  name: string;
  type: string;
  property_name?: string;
  serial_number: string | null;
  registration_number: string | null;
  installation_year: number | null;
}

interface ComponentsCardsViewProps {
  components: ComponentCardItem[];
  riskById: Map<string, ComponentRiskResult>;
  maintenanceStats: Record<string, { totalCost: number; count: number; lastDate: string | null }>;
  workOrderStats: Record<string, { count: number; totalPrice: number }>;
}

export function ComponentsCardsView({
  components,
  riskById,
  maintenanceStats,
  workOrderStats,
}: ComponentsCardsViewProps) {
  const navigate = useNavigate();

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {components.map((component) => (
        <Card
          key={component.id}
          className="group hover:shadow-lg transition-all duration-300 cursor-pointer"
          onClick={() => navigate(`/components/${component.id}`)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-lg">{component.name}</CardTitle>
                <CardDescription className="text-sm font-medium text-foreground/70">
                  {getTypeDisplayName(component.type)}
                </CardDescription>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <ComponentRiskBadge
                  risk={riskById.get(component.id)}
                  compact
                  className="shrink-0"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-primary" />
              <span>{component.property_name || 'Ej kopplad'}</span>
            </div>

            {component.serial_number && (
              <div className="text-sm text-muted-foreground">
                Serienr:{' '}
                <span className="font-medium text-foreground">{component.serial_number}</span>
              </div>
            )}

            {component.registration_number && (
              <div className="text-sm text-muted-foreground">
                Regnr:{' '}
                <span className="font-medium text-foreground">
                  {component.registration_number}
                </span>
              </div>
            )}

            {component.installation_year && (
              <div className="text-sm text-muted-foreground">
                Installerad:{' '}
                <span className="font-medium text-foreground">
                  {component.installation_year}
                </span>
              </div>
            )}

            {(maintenanceStats[component.id] || workOrderStats[component.id]) && (
              <div className="border-t pt-2 mt-2 space-y-1">
                {maintenanceStats[component.id] && (
                  <div className="text-sm text-muted-foreground">
                    Underhållskostnad:{' '}
                    <span className="font-semibold text-foreground">
                      {maintenanceStats[component.id].totalCost.toLocaleString('sv-SE')} kr
                    </span>
                  </div>
                )}
                {workOrderStats[component.id] && (
                  <div className="text-sm text-muted-foreground">
                    Arbetsordrar:{' '}
                    <span className="font-medium text-foreground">
                      {workOrderStats[component.id].count} st
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
