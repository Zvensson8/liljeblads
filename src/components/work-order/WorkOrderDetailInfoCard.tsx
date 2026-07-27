import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  workOrderPriorityBadge,
  workOrderStatusLabel,
} from '@/lib/workOrderLabels';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { WorkOrderWithRelations } from '@/types/domain';

interface WorkOrderDetailInfoCardProps {
  workOrder: WorkOrderWithRelations;
}

export function WorkOrderDetailInfoCard({ workOrder }: WorkOrderDetailInfoCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-muted-foreground">Åtgärd</Label>
            <p className="font-medium">{workOrder.action}</p>
          </div>
          <div>
            <Label className="text-muted-foreground">Fastighet</Label>
            <p className="font-medium">{workOrder.properties?.name}</p>
          </div>
          {workOrder.components && (
            <div>
              <Label className="text-muted-foreground">Komponent</Label>
              <p className="font-medium">
                {workOrder.components.name} ({workOrder.components.type})
              </p>
            </div>
          )}
          <div>
            <Label className="text-muted-foreground">Status</Label>
            <div className="mt-1">
              <Badge variant="outline">{workOrderStatusLabel(workOrder.status)}</Badge>
            </div>
          </div>
          <div>
            <Label className="text-muted-foreground">Prioritet</Label>
            <div className="mt-1">{workOrderPriorityBadge(workOrder.priority)}</div>
          </div>
          <div>
            <Label className="text-muted-foreground">Entreprenör</Label>
            <p className="font-medium">{workOrder.contractor || '-'}</p>
          </div>
          <div>
            <Label className="text-muted-foreground">Pris</Label>
            <p className="font-medium text-green-500">
              {workOrder.price
                ? `${Number(workOrder.price).toLocaleString('sv-SE')} kr`
                : '-'}
            </p>
          </div>
          <div>
            <Label className="text-muted-foreground">Datum</Label>
            <p className="font-medium">
              {workOrder.due_date
                ? format(new Date(workOrder.due_date), 'yyyy-MM-dd', { locale: sv })
                : '-'}
            </p>
          </div>
          <div>
            <Label className="text-muted-foreground">Kvartal</Label>
            <p className="font-medium">{workOrder.quarter || '-'}</p>
          </div>
        </div>
        {workOrder.comments && (
          <>
            <Separator />
            <div>
              <Label className="text-muted-foreground">Kommentar</Label>
              <p className="mt-1 text-sm">{workOrder.comments}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
