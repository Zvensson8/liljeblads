import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ComponentRiskBadge } from '@/components/ComponentRiskBadge';
import { QuickServiceButton } from '@/components/QuickServiceButton';
import { getTypeDisplayName } from '@/lib/componentTypeLabels';
import { componentStatusClassName, componentStatusLabel } from '@/lib/componentLabels';
import { componentPath } from '@/lib/entityPaths';
import type { ComponentRiskResult } from '@/lib/componentRisk';

export interface ComponentTableItem {
  id: string;
  name: string;
  type: string;
  status: string;
  manufacturer: string | null;
  room_zone: string | null;
  property_id?: string;
  property_name?: string;
}

interface ComponentsTableViewProps {
  components: ComponentTableItem[];
  riskById: Map<string, ComponentRiskResult>;
  lastServiceById: Record<string, string>;
  onDelete: (id: string, name: string) => void;
  onRefresh: () => void;
}

export function ComponentsTableView({
  components,
  riskById,
  lastServiceById,
  onDelete,
  onRefresh,
}: ComponentsTableViewProps) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b text-sm text-muted-foreground">
                <th className="text-left py-3 px-4 font-medium">Komponent</th>
                <th className="text-left py-3 px-4 font-medium hidden md:table-cell">Typ</th>
                <th className="text-left py-3 px-4 font-medium hidden lg:table-cell">
                  Tillverkare
                </th>
                <th className="text-left py-3 px-4 font-medium">Fastighet</th>
                <th className="text-left py-3 px-4 font-medium">Risk</th>
                <th className="text-left py-3 px-4 font-medium hidden sm:table-cell">
                  Senaste service
                </th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium">Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {components.map((component) => {
                const lastService = lastServiceById[component.id];
                const risk = riskById.get(component.id);
                return (
                  <tr
                    key={component.id}
                    className="border-b hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate(componentPath(component.id))}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium">{component.name}</div>
                      <div className="text-xs text-muted-foreground md:hidden">
                        {getTypeDisplayName(component.type)}
                      </div>
                      {component.room_zone && (
                        <div className="text-xs text-muted-foreground">{component.room_zone}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm hidden md:table-cell">
                      {getTypeDisplayName(component.type)}
                    </td>
                    <td className="py-3 px-4 text-sm hidden lg:table-cell">
                      {component.manufacturer || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm font-medium">
                        {component.property_name || '—'}
                      </div>
                    </td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      {risk ? (
                        <ComponentRiskBadge risk={risk} compact />
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </td>
                    <td className="py-2 px-4 hidden sm:table-cell text-sm text-muted-foreground">
                      {lastService
                        ? format(new Date(lastService), 'd MMM yyyy', { locale: sv })
                        : 'Ingen service'}
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={componentStatusClassName(component.status)}>
                        {componentStatusLabel(component.status)}
                      </Badge>
                    </td>
                    <td className="py-2 px-4">
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <QuickServiceButton
                          componentId={component.id}
                          componentName={component.name}
                          onSuccess={onRefresh}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => onDelete(component.id, component.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
