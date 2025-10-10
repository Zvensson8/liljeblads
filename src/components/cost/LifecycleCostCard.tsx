import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TrendingUp, AlertTriangle, Calendar, DollarSign } from "lucide-react";
import { getComponentLifecycleCost } from "@/lib/costUtils";

interface LifecycleCostCardProps {
  componentId: string;
}

export function LifecycleCostCard({ componentId }: LifecycleCostCardProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchLifecycleCost();
  }, [componentId]);

  const fetchLifecycleCost = async () => {
    setLoading(true);
    try {
      const result = await getComponentLifecycleCost(componentId);
      setData(result);
    } catch (error) {
      console.error('Error fetching lifecycle cost:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-[300px]" />;
  }

  if (!data) {
    return (
      <Alert>
        <AlertDescription>Kunde inte hämta livscykelkostnad</AlertDescription>
      </Alert>
    );
  }

  const shouldReplace = data.purchaseInfo?.purchase_cost && 
    data.totalMaintenanceCost > data.purchaseInfo.purchase_cost * 0.7;

  const warrantyActive = data.purchaseInfo?.warranty_years && 
    data.purchaseInfo.purchase_date &&
    new Date().getFullYear() - new Date(data.purchaseInfo.purchase_date).getFullYear() < data.purchaseInfo.warranty_years;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Livscykelkostnadsanalys (TCO)
        </CardTitle>
        <CardDescription>{data.component.name}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total kostnad (TCO)</p>
            <p className="text-2xl font-bold">
              {Math.round(data.totalCost).toLocaleString('sv-SE')} kr
            </p>
          </div>
          
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Kostnad per år</p>
            <p className="text-2xl font-bold">
              {Math.round(data.costPerYear).toLocaleString('sv-SE')} kr
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">År i drift</p>
            <p className="text-xl font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {data.yearsInService} år
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Antal underhåll</p>
            <p className="text-xl font-semibold">
              {data.maintenanceCount} st
            </p>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="space-y-2 pt-4 border-t">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Inköpskostnad</span>
            <span className="font-medium">
              {data.purchaseInfo?.purchase_cost 
                ? `${Math.round(data.purchaseInfo.purchase_cost).toLocaleString('sv-SE')} kr`
                : 'Ej registrerad'}
            </span>
          </div>
          
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total underhållskostnad</span>
            <span className="font-medium">
              {Math.round(data.totalMaintenanceCost).toLocaleString('sv-SE')} kr
            </span>
          </div>

          {data.purchaseInfo?.expected_lifespan_years && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Förväntad livslängd</span>
              <span className="font-medium">
                {data.purchaseInfo.expected_lifespan_years} år
              </span>
            </div>
          )}
        </div>

        {/* Warranty Status */}
        {warrantyActive && (
          <Badge variant="secondary" className="w-full justify-center">
            Garanti aktiv
          </Badge>
        )}

        {/* Recommendations */}
        {shouldReplace && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Rekommendation:</strong> Underhållskostnaden har nått 70% av inköpsvärdet. 
              Överväg att byta ut komponenten.
            </AlertDescription>
          </Alert>
        )}

        {data.maintenanceCount > 5 && data.yearsInService < 3 && (
          <Alert>
            <AlertDescription>
              <strong>Observation:</strong> Hög underhållsfrekvens ({data.maintenanceCount} åtgärder på {data.yearsInService} år). 
              Undersök om det finns ett underliggande problem.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
