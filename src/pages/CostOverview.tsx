import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Package,
  Calendar,
  PieChart,
  ArrowRight
} from "lucide-react";
import { 
  getTopCostComponents, 
  getCostTrend, 
  getSupplierAnalysis,
  getFlagEmoji 
} from "@/lib/costUtils";
import { CostBudgetDialog } from "@/components/cost/CostBudgetDialog";

export default function CostOverview() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  
  const [totalCost12Months, setTotalCost12Months] = useState(0);
  const [avgMonthlyCost, setAvgMonthlyCost] = useState(0);
  const [costChange, setCostChange] = useState(0);
  const [criticalComponents, setCriticalComponents] = useState(0);
  const [topComponents, setTopComponents] = useState<any[]>([]);
  const [topSuppliers, setTopSuppliers] = useState<any[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    } else if (user) {
      fetchOverviewData();
    }
  }, [user, authLoading, navigate]);

  const fetchOverviewData = async () => {
    setLoading(true);
    try {
      const [components, trend, suppliers] = await Promise.all([
        getTopCostComponents(5, 12),
        getCostTrend(12),
        getSupplierAnalysis()
      ]);

      // Calculate totals
      const total12 = trend.reduce((sum, t) => sum + t.cost, 0);
      const avgMonthly = trend.length > 0 ? total12 / trend.length : 0;

      // Calculate cost change (last 6 months vs previous 6 months)
      const lastSixMonths = trend.slice(-6).reduce((sum, t) => sum + t.cost, 0);
      const prevSixMonths = trend.slice(0, 6).reduce((sum, t) => sum + t.cost, 0);
      const change = prevSixMonths > 0 
        ? ((lastSixMonths - prevSixMonths) / prevSixMonths) * 100 
        : 0;

      const critical = components.filter(c => 
        c.flag_type === 'red' || c.flag_type === 'black'
      ).length;

      setTotalCost12Months(total12);
      setAvgMonthlyCost(avgMonthly);
      setCostChange(change);
      setCriticalComponents(critical);
      setTopComponents(components);
      setTopSuppliers(suppliers.slice(0, 3));

    } catch (error) {
      console.error('Error fetching overview data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <SidebarInset className="flex-1">
            <div className="p-6 space-y-6">
              <Skeleton className="h-[200px]" />
              <Skeleton className="h-[400px]" />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    );
  }

  const hasWarnings = criticalComponents > 0;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1">
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Kostnadsöversikt</h1>
            </div>
          </header>

          <main className="flex-1 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Welcome and Quick Summary */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold mb-2">Ekonomisk översikt</h2>
                  <p className="text-muted-foreground">
                    Fullständig översikt av underhållskostnader
                  </p>
                </div>
                <Button onClick={() => setBudgetDialogOpen(true)}>
                  <Calendar className="mr-2 h-4 w-4" />
                  Skapa budget
                </Button>
              </div>

              {/* Critical Alerts */}
              {hasWarnings && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Kritiska kostnadsvarningar</AlertTitle>
                  <AlertDescription>
                    Du har {criticalComponents} komponent{criticalComponents > 1 ? 'er' : ''} med 
                    kritiskt höga kostnader som kräver uppmärksamhet.
                  </AlertDescription>
                </Alert>
              )}

              {/* Main KPI Cards */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total kostnad (12 mån)</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {Math.round(totalCost12Months).toLocaleString('sv-SE')} kr
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Alla underhållskostnader
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Genomsnitt per månad</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {Math.round(avgMonthlyCost).toLocaleString('sv-SE')} kr
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {costChange > 0 ? (
                        <>
                          <TrendingUp className="h-3 w-3 text-red-500" />
                          <span className="text-xs text-red-500">+{costChange.toFixed(1)}% vs förra halvåret</span>
                        </>
                      ) : costChange < 0 ? (
                        <>
                          <TrendingDown className="h-3 w-3 text-green-500" />
                          <span className="text-xs text-green-500">{costChange.toFixed(1)}% vs förra halvåret</span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Ingen förändring</span>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Kritiska komponenter</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{criticalComponents}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Behöver åtgärd eller utbyte
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Högkostnadskomponenter</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{topComponents.length}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Med registrerade kostnader
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Top Cost Components */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Top 5 Dyraste Komponenter</CardTitle>
                        <CardDescription>Senaste 12 månaderna</CardDescription>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => navigate('/')}
                      >
                        Se alla
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {topComponents.length > 0 ? (
                      <div className="space-y-4">
                        {topComponents.map((component, index) => (
                          <div key={component.component_id} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-2xl">{getFlagEmoji(component.flag_type)}</span>
                                <div>
                                  <p className="font-medium">{component.component_name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {component.component_type}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold">
                                  {Math.round(component.total_cost).toLocaleString('sv-SE')} kr
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {component.maintenance_count} åtgärder
                                </p>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground pl-11">
                              {component.flag_reason}
                            </p>
                            {index < topComponents.length - 1 && (
                              <div className="border-b border-border mt-2" />
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        Ingen kostnadsdata tillgänglig
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Top Suppliers */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Top 3 Leverantörer</CardTitle>
                        <CardDescription>Efter total kostnad</CardDescription>
                      </div>
                      <PieChart className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {topSuppliers.length > 0 ? (
                      <div className="space-y-6">
                        {topSuppliers.map((supplier, index) => {
                          const percentage = totalCost12Months > 0 
                            ? (supplier.total_cost / totalCost12Months) * 100 
                            : 0;
                          
                          return (
                            <div key={supplier.supplier} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{supplier.supplier}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {supplier.action_count} åtgärder
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold">
                                    {Math.round(supplier.total_cost).toLocaleString('sv-SE')} kr
                                  </p>
                                  <Badge variant="secondary">
                                    {percentage.toFixed(1)}% av total
                                  </Badge>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Progress value={percentage} className="h-2" />
                                <p className="text-xs text-muted-foreground">
                                  Genomsnitt: {Math.round(supplier.avg_cost).toLocaleString('sv-SE')} kr/åtgärd
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        Ingen leverantörsdata tillgänglig
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Rekommenderade åtgärder</CardTitle>
                  <CardDescription>Vad du kan göra härnäst</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {criticalComponents > 0 && (
                    <Button 
                      variant="destructive" 
                      className="w-full justify-start"
                      onClick={() => navigate('/components')}
                    >
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      Granska {criticalComponents} kritisk{criticalComponents > 1 ? 'a' : ''} komponent{criticalComponents > 1 ? 'er' : ''}
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => setBudgetDialogOpen(true)}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    Sätt årsbudget för kostnader
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => navigate('/')}
                  >
                    <TrendingUp className="mr-2 h-4 w-4" />
                    Se detaljerad kostnadsanalys
                  </Button>
                </CardContent>
              </Card>
            </div>
          </main>
        </SidebarInset>
      </div>

      <CostBudgetDialog 
        open={budgetDialogOpen}
        onOpenChange={setBudgetDialogOpen}
        onSuccess={fetchOverviewData}
      />
    </SidebarProvider>
  );
}
