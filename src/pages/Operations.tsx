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
import { Loader2, Copy, Download, ClipboardList, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { QuarterCard } from "@/components/operations/QuarterCard";
import { CategoryDialog } from "@/components/operations/CategoryDialog";
import { AppSidebar } from "@/components/AppSidebar";
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
        <SidebarInset className="flex-1">
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Driftuppföljning</h1>
            </div>
          </header>

          <main className="flex-1 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setCategoryDialogOpen(true)}
                    disabled={!selectedProperty}
                  >
                    Hantera kategorier
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCopyYear}
                    disabled={loading || !selectedProperty}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    Kopiera år
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={!selectedProperty || loading}
                      >
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Exportera
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
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Välj fastighet och år</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                      <SelectTrigger>
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
                  
                  <div className="flex-1 min-w-[200px]">
                    <Select
                      value={selectedYear.toString()}
                      onValueChange={(value) => setSelectedYear(parseInt(value))}
                    >
                      <SelectTrigger>
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
                  </div>
                </CardContent>
              </Card>

              {selectedProperty && (
                <div className="grid gap-6">
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
              )}

              <CategoryDialog
                open={categoryDialogOpen}
                onOpenChange={setCategoryDialogOpen}
                propertyId={selectedProperty}
              />
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
