import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Copy, Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { QuarterCard } from "@/components/operations/QuarterCard";
import { TaskDialog } from "@/components/operations/TaskDialog";
import { CategoryDialog } from "@/components/operations/CategoryDialog";

interface Property {
  id: string;
  name: string;
}

export default function Operations() {
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [selectedQuarter, setSelectedQuarter] = useState<Database["public"]["Enums"]["quarter_type"] | null>(null);

  useEffect(() => {
    if (user) {
      fetchProperties();
    }
  }, [user]);

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

  const handleExport = async () => {
    toast.info("Exportfunktion kommer snart");
  };

  const handleAddTask = (quarter: Database["public"]["Enums"]["quarter_type"]) => {
    setSelectedQuarter(quarter);
    setTaskDialogOpen(true);
  };

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Vänligen logga in för att se driftuppföljning</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h1 className="text-3xl font-bold">Driftuppföljning</h1>
          
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
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={!selectedProperty}
            >
              <Download className="h-4 w-4" />
              Exportera
            </Button>
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
            {(["Q1", "Q2", "Q3", "Q4"] as const).map((quarter) => (
              <QuarterCard
                key={quarter}
                quarter={quarter}
                propertyId={selectedProperty}
                year={selectedYear}
                onAddTask={() => handleAddTask(quarter)}
              />
            ))}
          </div>
        )}

        {selectedQuarter && (
          <TaskDialog
            open={taskDialogOpen}
            onOpenChange={setTaskDialogOpen}
            propertyId={selectedProperty}
            year={selectedYear}
            quarter={selectedQuarter}
          />
        )}

        <CategoryDialog
          open={categoryDialogOpen}
          onOpenChange={setCategoryDialogOpen}
          propertyId={selectedProperty}
        />
      </div>
    </div>
  );
}
