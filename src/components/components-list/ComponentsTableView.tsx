import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ComponentRiskBadge } from '@/components/ComponentRiskBadge';
import { FloorSelector } from '@/components/FloorSelector';
import { LastServiceBadge } from '@/components/LastServiceBadge';
import { QuickServiceButton } from '@/components/QuickServiceButton';
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
  floor_id: string;
}

interface ComponentsTableViewProps {
  components: ComponentTableItem[];
  riskById: Map<string, ComponentRiskResult>;
  maintenanceStats: Record<string, { totalCost: number }>;
  workOrderStats: Record<string, { totalPrice: number }>;
  onDelete: (id: string, name: string) => void;
  onRefresh: () => void;
  getStatusColor: (status: string) => string;
  getStatusText: (status: string) => string;
}

export function ComponentsTableView({
  components,
  riskById,
  maintenanceStats,
  workOrderStats,
  onDelete,
  onRefresh,
  getStatusColor,
  getStatusText,
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
                <th className="text-left py-3 px-4 font-medium">Våning</th>
                <th className="text-left py-3 px-4 font-medium hidden sm:table-cell">
                  Senaste service
                </th>
                <th className="text-left py-3 px-4 font-medium hidden lg:table-cell">Kostnad</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium">Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {components.map((component) => {
                const totalCost =
                  (maintenanceStats[component.id]?.totalCost || 0) +
                  (workOrderStats[component.id]?.totalPrice || 0);
                return (
                  <tr
                    key={component.id}
                    className="border-b hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate(`/components/${component.id}`)}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium">{component.name}</div>
                      <div className="text-xs text-muted-foreground md:hidden">
                        {component.type}
                      </div>
                      {component.room_zone && (
                        <div className="text-xs text-muted-foreground">{component.room_zone}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm hidden md:table-cell">{component.type}</td>
                    <td className="py-3 px-4 text-sm hidden lg:table-cell">
                      {component.manufacturer || '-'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm font-medium">{component.property_name}</div>
                    </td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <ComponentRiskBadge risk={riskById.get(component.id)} compact />
                    </td>
                    <td className="py-2 px-4" onClick={(e) => e.stopPropagation()}>
                      {component.property_id ? (
                        <FloorSelector
                          componentId={component.id}
                          propertyId={component.property_id}
                          currentFloorId={component.floor_id}
                          onSuccess={onRefresh}
                          compact
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground italic">-</span>
                      )}
                    </td>
                    <td
                      className="py-2 px-4 hidden sm:table-cell"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <LastServiceBadge componentId={component.id} />
                    </td>
                    <td className="py-3 px-4 text-sm hidden lg:table-cell">
                      {totalCost > 0 ? `${totalCost.toLocaleString('sv-SE')} kr` : '-'}
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={getStatusColor(component.status)}>
                        {getStatusText(component.status)}
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
