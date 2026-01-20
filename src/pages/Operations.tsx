import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useNavigate } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, Download, ClipboardList, FileSpreadsheet, ChevronLeft, ChevronRight, Calendar, Building2 } from "lucide-react";
import { toast } from "sonner";
import { QuarterCard } from "@/components/operations/QuarterCard";
import { CategoryDialog } from "@/components/operations/CategoryDialog";
import { AppSidebar } from "@/components/AppSidebar";
import { TaskTemplateLibrary } from "@/components/operations/TaskTemplateLibrary";
import { ReportGenerator } from "@/components/operations/ReportGenerator";
import { MultiPropertyReportDialog } from "@/components/operations/MultiPropertyReportDialog";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { exportYearToExcel } from "@/lib/operationsExport";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Property {
  id: string;
  name: string;
}

export default function Operations() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [reportGeneratorOpen, setReportGeneratorOpen] = useState(false);
  const [multiPropertyReportOpen, setMultiPropertyReportOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    } else if (user) {
      fetchProperties();
    }
  }, [user, authLoading, navigate]);

  const fetchProperties = async () => {
    const { data, error } = await supabase
      .from("properties")
      .select("id, name")
      .order("name");

    if (error) {
      toast.error("Kunde inte hämta fastigheter");
      return;
    }

    setProperties(data || []);
    if (data && data.length > 0) {
      setSelectedProperty(data[0].id);
    }
  };

  const handleCopyYear = async () => {
    if (!selectedProperty) return;

    setLoading(true);
    try {
      const { data: tasks, error: fetchError } = await supabase
        .from("drift_tasks")
        .select("*")
        .eq("property_id", selectedProperty)
        .eq("year", selectedYear);

      if (fetchError) throw fetchError;

      if (!tasks || tasks.length === 0) {
        toast.error("Inga uppgifter att kopiera");
        setLoading(false);
        return;
      }

      const newTasks = tasks.map((task) => ({
        property_id: task.property_id,
        year: selectedYear + 1,
        quarter: task.quarter,
        category_id: task.category_id,
        name: task.name,
        description: task.description,
        planned_count: task.planned_count,
        reported_count: 0,
      }));

      const { error: insertError } = await supabase
        .from("drift_tasks")
        .insert(newTasks);

      if (insertError) throw insertError;

      toast.success(`Kopierade ${tasks.length} uppgifter till ${selectedYear + 1}`);
      setSelectedYear(selectedYear + 1);
    } catch (error) {
      console.error("Error copying year:", error);
      toast.error("Kunde inte kopiera år");
    } finally {
      setLoading(false);
    }
  };

  const handleExportYear = async () => {
    if (!selectedProperty) return;

    const property = properties.find((p) => p.id === selectedProperty);
    if (!property) return;

    try {
      setLoading(true);
      await exportYearToExcel(selectedProperty, property.name, selectedYear);
      toast.success("Export slutförd");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Kunde inte exportera data");
    } finally {
      setLoading(false);
    }
  };

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 w-full">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-2 md:gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
            <SidebarTrigger className="hidden md:flex" />
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold hidden sm:block">Driftuppföljning</h1>
              <h1 className="text-lg font-semibold sm:hidden">Drift</h1>
            </div>
            
            {/* Property selector - always visible */}
            <div className="flex-1 max-w-[200px] ml-auto lg:ml-4">
              <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Välj fastighet" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Year navigation - compact */}
            <div className="flex items-center gap-1 border rounded-md">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSelectedYear(selectedYear - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Select
                value={selectedYear.toString()}
                onValueChange={(value) => setSelectedYear(parseInt(value))}
              >
                <SelectTrigger className="h-8 w-[80px] border-0 text-sm font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSelectedYear(selectedYear + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <main className="flex-1 p-4 lg:p-6 pb-20 md:pb-6">
            <div className="max-w-7xl mx-auto space-y-4">
              {/* Action bar - collapsible on mobile */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setReportGeneratorOpen(true)}
                  disabled={!selectedProperty}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">Generera rapport</span>
                  <span className="sm:hidden">Rapport</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setMultiPropertyReportOpen(true)}
                >
                  <Building2 className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">Samlad rapport</span>
                  <span className="sm:hidden">Samlad</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setTemplateLibraryOpen(true)}
                  disabled={!selectedProperty}
                >
                  <span className="hidden sm:inline">Mallbibliotek</span>
                  <span className="sm:hidden">Mallar</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setCategoryDialogOpen(true)}
                  disabled={!selectedProperty}
                >
                  <span className="hidden sm:inline">Kategorier</span>
                  <span className="sm:hidden">Kat.</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={handleCopyYear}
                  disabled={loading || !selectedProperty}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Copy className="h-4 w-4 mr-1.5" />
                  )}
                  <span className="hidden sm:inline">Kopiera till {selectedYear + 1}</span>
                  <span className="sm:hidden">Kopiera</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={!selectedProperty || loading}
                    >
                      <Download className="h-4 w-4 mr-1.5" />
                      <span className="hidden sm:inline">Exportera</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Exportera till Excel</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleExportYear}>
                      <Download className="h-4 w-4 mr-2" />
                      Hela året ({selectedYear})
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {selectedProperty && (
                <Tabs defaultValue="quarters" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:inline-flex">
                    <TabsTrigger value="quarters" className="gap-1.5">
                      <Calendar className="h-4 w-4" />
                      <span>Kvartal</span>
                    </TabsTrigger>
                    <TabsTrigger value="year-overview" className="gap-1.5">
                      <ClipboardList className="h-4 w-4" />
                      <span>Årsöversikt</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="quarters" className="space-y-4 mt-4">
                    <div className="space-y-4">
                      {(["Q1", "Q2", "Q3", "Q4"] as const).map((quarter) => {
                        const property = properties.find(p => p.id === selectedProperty);
                        return (
                          <QuarterCard
                            key={quarter}
                            quarter={quarter}
                            propertyId={selectedProperty}
                            propertyName={property?.name || ""}
                            year={selectedYear}
                          />
                        );
                      })}
                    </div>
                  </TabsContent>

                  <TabsContent value="year-overview" className="mt-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Calendar className="h-5 w-5" />
                          Årsöversikt {selectedYear}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-muted-foreground">
                          Välj ett kvartal ovan för att se detaljer.
                        </p>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              )}

              {!selectedProperty && (
                <Card className="text-center py-12 border-dashed">
                  <CardContent>
                    <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-muted-foreground">
                      Välj en fastighet för att se driftuppföljning
                    </p>
                  </CardContent>
                </Card>
              )}

              <CategoryDialog
                open={categoryDialogOpen}
                onOpenChange={setCategoryDialogOpen}
                propertyId={selectedProperty}
              />

              {selectedProperty && (
                <>
                  <ReportGenerator
                    open={reportGeneratorOpen}
                    onOpenChange={setReportGeneratorOpen}
                    propertyId={selectedProperty}
                    year={selectedYear}
                  />

                  <TaskTemplateLibrary
                    open={templateLibraryOpen}
                    onOpenChange={setTemplateLibraryOpen}
                    propertyId={selectedProperty}
                  />
                </>
              )}

              <MultiPropertyReportDialog
                open={multiPropertyReportOpen}
                onOpenChange={setMultiPropertyReportOpen}
              />
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
