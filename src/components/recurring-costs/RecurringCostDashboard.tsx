import { useState, useEffect } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Download, Calendar, Building2, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  RecurringCost,
  calculatePaymentDates,
  groupByQuarter,
  groupByMonth,
  calculateAnnualCost,
  calculateMonthlyCost,
  generateForecastData,
  QuarterSummary,
  MonthSummary,
} from "@/lib/recurringCostUtils";
import { format, addYears } from "date-fns";
import { sv } from "date-fns/locale";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface Property {
  id: string;
  name: string;
}

export function RecurringCostDashboard() {
  const { organization } = useOrganization();
  const [costs, setCosts] = useState<RecurringCost[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [selectedView, setSelectedView] = useState<"quarter" | "month">("quarter");
  const [forecastYears, setForecastYears] = useState<number>(5);
  const [quarterData, setQuarterData] = useState<QuarterSummary[]>([]);
  const [monthData, setMonthData] = useState<MonthSummary[]>([]);
  const [forecastData, setForecastData] = useState<{ month: string; amount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (organization) {
      fetchData();
    }
  }, [organization, selectedProperty]);

  useEffect(() => {
    if (costs.length > 0) {
      calculateProjections();
    }
  }, [costs, forecastYears]);

  const fetchData = async () => {
    if (!organization) return;
    
    setLoading(true);
    try {
      // Hämta fastigheter
      const { data: propData, error: propError } = await supabase
        .from("properties")
        .select("id, name")
        .eq("organization_id", organization.id)
        .order("name");

      if (propError) throw propError;
      setProperties(propData || []);

      // Hämta kostnader
      let query = supabase
        .from("property_recurring_costs")
        .select(`
          *,
          property:properties!inner(id, name),
          account_code:account_codes(code, description)
        `)
        .eq("properties.organization_id", organization.id);

      if (selectedProperty !== "all") {
        query = query.eq("property_id", selectedProperty);
      }

      const { data: costData, error: costError } = await query;
      if (costError) throw costError;

      setCosts((costData || []) as RecurringCost[]);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Kunde inte hämta data");
    } finally {
      setLoading(false);
    }
  };

  const calculateProjections = () => {
    const startDate = new Date();
    const endDate = addYears(startDate, forecastYears);

    // Beräkna alla projektioner
    const allProjections = costs.flatMap((cost) =>
      calculatePaymentDates(cost, startDate, endDate)
    );

    // Gruppera per kvartal och månad
    setQuarterData(groupByQuarter(allProjections));
    setMonthData(groupByMonth(allProjections));
    setForecastData(generateForecastData(costs, forecastYears));
  };

  const totalAnnualCost = costs.reduce((sum, cost) => sum + calculateAnnualCost(cost), 0);
  const totalMonthlyCost = costs.reduce((sum, cost) => sum + calculateMonthlyCost(cost), 0);

  const exportToCSV = () => {
    const data = selectedView === "quarter" ? quarterData : monthData;
    
    let csv = "Period;Fastighet;Konto;Beskrivning;Belopp\n";
    
    data.forEach((period: any) => {
      Object.values(period.properties).forEach((prop: any) => {
        Object.values(prop.accountCodes).forEach((acc: any) => {
          acc.costs.forEach((cost: any) => {
            csv += `${period.quarter || period.month};${prop.name};${acc.code};${cost.description};${cost.amount}\n`;
          });
        });
      });
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `återkommande-kostnader-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    
    toast.success("Export klar");
  };

  if (loading) {
    return <div>Laddar...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Översikt */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Totalt Antal</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{costs.length}</div>
            <p className="text-xs text-muted-foreground">Återkommande kostnader</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Månadskostnad</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMonthlyCost.toLocaleString("sv-SE")} kr</div>
            <p className="text-xs text-muted-foreground">Genomsnitt per månad</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Årskostnad</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAnnualCost.toLocaleString("sv-SE")} kr</div>
            <p className="text-xs text-muted-foreground">Totalt per år</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Fastigheter</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{properties.length}</div>
            <p className="text-xs text-muted-foreground">Med kostnader</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter och inställningar */}
      <Card>
        <CardHeader>
          <CardTitle>Inställningar</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="flex-1">
            <Label>Fastighet</Label>
            <Select value={selectedProperty} onValueChange={setSelectedProperty}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla fastigheter</SelectItem>
                {properties.map((prop) => (
                  <SelectItem key={prop.id} value={prop.id}>
                    {prop.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <Label>Prognoslängd</Label>
            <Select value={forecastYears.toString()} onValueChange={(v) => setForecastYears(parseInt(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 år</SelectItem>
                <SelectItem value="3">3 år</SelectItem>
                <SelectItem value="5">5 år</SelectItem>
                <SelectItem value="10">10 år</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button onClick={exportToCSV} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Exportera CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Prognos diagram */}
      <Card>
        <CardHeader>
          <CardTitle>Prognos - {forecastYears} år framåt</CardTitle>
          <CardDescription>Månadsvis kostnadsfördelning</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip formatter={(value) => `${Number(value).toLocaleString("sv-SE")} kr`} />
              <Legend />
              <Line type="monotone" dataKey="amount" name="Kostnad" stroke="hsl(var(--primary))" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Detaljerad vy */}
      <Card>
        <CardHeader>
          <CardTitle>Detaljerad Översikt</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedView} onValueChange={(v) => setSelectedView(v as "quarter" | "month")}>
            <TabsList className="mb-4">
              <TabsTrigger value="quarter">Per Kvartal</TabsTrigger>
              <TabsTrigger value="month">Per Månad</TabsTrigger>
            </TabsList>

            <TabsContent value="quarter">
              <div className="space-y-6">
                {quarterData.map((quarter) => (
                  <Card key={quarter.quarter}>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <CardTitle>{quarter.quarter}</CardTitle>
                        <Badge variant="secondary" className="text-lg">
                          {quarter.total.toLocaleString("sv-SE")} kr
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {Object.values(quarter.properties).map((property) => (
                        <div key={property.name} className="mb-6">
                          <h4 className="font-semibold text-lg mb-3 flex justify-between">
                            <span>{property.name}</span>
                            <span className="text-muted-foreground">
                              {property.total.toLocaleString("sv-SE")} kr
                            </span>
                          </h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Konto</TableHead>
                                <TableHead>Beskrivning</TableHead>
                                <TableHead>Antal</TableHead>
                                <TableHead className="text-right">Belopp</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {Object.values(property.accountCodes).map((account) =>
                                account.costs.map((cost, idx) => (
                                  <TableRow key={`${account.code}-${idx}`}>
                                    {idx === 0 && (
                                      <TableCell rowSpan={account.costs.length} className="font-medium">
                                        {account.code}
                                        <div className="text-xs text-muted-foreground">{account.description}</div>
                                      </TableCell>
                                    )}
                                    <TableCell>
                                      {cost.description}
                                      {cost.hasVariation && (
                                        <Badge variant="outline" className="ml-2">
                                          ±variation
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell>{cost.dates.length}x</TableCell>
                                    <TableCell className="text-right">
                                      {cost.amount.toLocaleString("sv-SE")} kr
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="month">
              <div className="space-y-6">
                {monthData.slice(0, 24).map((month) => (
                  <Card key={`${month.year}-${month.monthNum}`}>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <CardTitle>{month.month}</CardTitle>
                        <Badge variant="secondary" className="text-lg">
                          {month.total.toLocaleString("sv-SE")} kr
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {Object.values(month.properties).map((property) => (
                        <div key={property.name} className="mb-6">
                          <h4 className="font-semibold text-lg mb-3 flex justify-between">
                            <span>{property.name}</span>
                            <span className="text-muted-foreground">
                              {property.total.toLocaleString("sv-SE")} kr
                            </span>
                          </h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Konto</TableHead>
                                <TableHead>Beskrivning</TableHead>
                                <TableHead>Antal</TableHead>
                                <TableHead className="text-right">Belopp</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {Object.values(property.accountCodes).map((account) =>
                                account.costs.map((cost, idx) => (
                                  <TableRow key={`${account.code}-${idx}`}>
                                    {idx === 0 && (
                                      <TableCell rowSpan={account.costs.length} className="font-medium">
                                        {account.code}
                                        <div className="text-xs text-muted-foreground">{account.description}</div>
                                      </TableCell>
                                    )}
                                    <TableCell>
                                      {cost.description}
                                      {cost.hasVariation && (
                                        <Badge variant="outline" className="ml-2">
                                          ±variation
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell>{cost.dates.length}x</TableCell>
                                    <TableCell className="text-right">
                                      {cost.amount.toLocaleString("sv-SE")} kr
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
