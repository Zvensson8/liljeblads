import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, History } from "lucide-react";

interface RecurringCostCardProps {
  cost: any;
  onEdit: (cost: any) => void;
  onDelete: (id: string) => void;
}

export function RecurringCostCard({ cost, onEdit, onDelete }: RecurringCostCardProps) {
  const getIntervalLabel = (months: number, variation?: number) => {
    if (months === 1) return "Månatlig";
    if (months === 3) return "Kvartalsvis";
    if (months === 12) return "Årlig";
    return `Var ${months} månad`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <CardTitle className="text-lg">{cost.description}</CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{cost.property?.name}</span>
              <span>•</span>
              <span>{cost.account_code?.code} - {cost.account_code?.description}</span>
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(cost)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(cost.id)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <div className="text-sm text-muted-foreground">Belopp</div>
            <div className="text-lg font-semibold">
              {cost.amount.toLocaleString("sv-SE")} kr
            </div>
          </div>

          <div>
            <div className="text-sm text-muted-foreground">Intervall</div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {getIntervalLabel(cost.base_interval_months)}
              </span>
              {cost.interval_variation_months > 0 && (
                <Badge variant="secondary" className="text-xs">
                  ±{cost.interval_variation_months} mån
                </Badge>
              )}
            </div>
          </div>

          <div>
            <div className="text-sm text-muted-foreground">Avtalspart</div>
            <div className="text-sm font-medium">
              {cost.contractor_name || "-"}
            </div>
          </div>

          <div>
            <div className="text-sm text-muted-foreground">Senaste betalning</div>
            <div className="text-sm font-medium">
              {cost.last_payment_date
                ? new Date(cost.last_payment_date).toLocaleDateString("sv-SE")
                : "-"}
            </div>
          </div>
        </div>

        {cost.calculated_quarter_start && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-muted-foreground">Beräknat kvartal: </span>
                <Badge variant="outline">
                  {cost.calculated_quarter_start === cost.calculated_quarter_end
                    ? cost.calculated_quarter_start
                    : `${cost.calculated_quarter_start} - ${cost.calculated_quarter_end}`}
                </Badge>
              </div>
              {cost.contact_person && (
                <div className="text-sm text-muted-foreground">
                  Kontakt: {cost.contact_person}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
