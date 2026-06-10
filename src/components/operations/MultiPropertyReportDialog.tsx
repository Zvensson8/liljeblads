import { useState, useEffect } from "react";
import { getErrorMessage } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FileText, Download, Building2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateMultiPropertyReport } from "@/lib/multiPropertyReportUtils";

interface Property {
  id: string;
  name: string;
}

interface MultiPropertyReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MultiPropertyReportDialog({
  open,
  onOpenChange,
}: MultiPropertyReportDialogProps) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [reportType, setReportType] = useState<string>("year");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [quarter, setQuarter] = useState<string>("Q1");
  const [format, setFormat] = useState<"excel" | "pdf">("excel");
  const [loading, setLoading] = useState(false);
  const [loadingProperties, setLoadingProperties] = useState(false);

  useEffect(() => {
    if (open) {
      fetchProperties();
    }
  }, [open]);

  const fetchProperties = async () => {
    setLoadingProperties(true);
    try {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name")
        .order("name");

      if (error) throw error;
      setProperties(data || []);
    } catch (error) {
      console.error("Error fetching properties:", error);
      toast.error("Kunde inte hämta fastigheter");
    } finally {
      setLoadingProperties(false);
    }
  };

  const handlePropertyToggle = (propertyId: string) => {
    setSelectedPropertyIds((prev) =>
      prev.includes(propertyId)
        ? prev.filter((id) => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  const handleSelectAll = () => {
    if (selectedPropertyIds.length === properties.length) {
      setSelectedPropertyIds([]);
    } else {
      setSelectedPropertyIds(properties.map((p) => p.id));
    }
  };

  const handleGenerate = async () => {
    if (selectedPropertyIds.length === 0) {
      toast.error("Välj minst en fastighet");
      return;
    }

    setLoading(true);
    try {
      const selectedProperties = properties.filter((p) =>
        selectedPropertyIds.includes(p.id)
      );

      await generateMultiPropertyReport({
        properties: selectedProperties,
        reportType,
        year,
        quarter,
        format,
      });

      toast.success(
        `Rapport genererad för ${selectedPropertyIds.length} fastighet${
          selectedPropertyIds.length > 1 ? "er" : ""
        }`
      );
      onOpenChange(false);
    } catch (error: unknown) {
      console.error("Error generating report:", error);
      toast.error(getErrorMessage(error) || "Kunde inte generera rapport");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby="multi-property-report-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Samlad rapport - Flera fastigheter
          </DialogTitle>
          <DialogDescription id="multi-property-report-description">
            Generera kvartals- eller årsrapport för flera fastigheter samtidigt
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Property selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Välj fastigheter</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="h-7 text-xs"
              >
                {selectedPropertyIds.length === properties.length
                  ? "Avmarkera alla"
                  : "Välj alla"}
              </Button>
            </div>
            {loadingProperties ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ScrollArea className="h-40 border rounded-md p-2">
                <div className="space-y-2">
                  {properties.map((property) => (
                    <div
                      key={property.id}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={property.id}
                        checked={selectedPropertyIds.includes(property.id)}
                        onCheckedChange={() => handlePropertyToggle(property.id)}
                      />
                      <label
                        htmlFor={property.id}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {property.name}
                      </label>
                    </div>
                  ))}
                  {properties.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Inga fastigheter hittades
                    </p>
                  )}
                </div>
              </ScrollArea>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {selectedPropertyIds.length} av {properties.length} valda
            </p>
          </div>

          {/* Report type */}
          <div>
            <Label htmlFor="report-type">Rapporttyp</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger id="report-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="year">Årsrapport</SelectItem>
                <SelectItem value="quarter">Kvartalsrapport</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Year */}
          <div>
            <Label htmlFor="year">År</Label>
            <Input
              id="year"
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              min={2000}
              max={2100}
            />
          </div>

          {/* Quarter (only for quarter report) */}
          {reportType === "quarter" && (
            <div>
              <Label htmlFor="quarter">Kvartal</Label>
              <Select value={quarter} onValueChange={setQuarter}>
                <SelectTrigger id="quarter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Q1">Q1</SelectItem>
                  <SelectItem value="Q2">Q2</SelectItem>
                  <SelectItem value="Q3">Q3</SelectItem>
                  <SelectItem value="Q4">Q4</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Format */}
          <div>
            <Label htmlFor="format">Format</Label>
            <Select
              value={format}
              onValueChange={(v) => setFormat(v as "excel" | "pdf")}
            >
              <SelectTrigger id="format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <h4 className="font-semibold mb-2">Beskrivning:</h4>
            {reportType === "year" && (
              <p>
                Årsrapporten innehåller en samlad översikt för alla valda
                fastigheter, följt av detaljerad information per fastighet och
                kvartal.
              </p>
            )}
            {reportType === "quarter" && (
              <p>
                Kvartalsrapporten innehåller en samlad översikt för alla valda
                fastigheter för det valda kvartalet, med detaljerad
                uppgiftsinformation per fastighet.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Avbryt
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={loading || selectedPropertyIds.length === 0}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {loading ? "Genererar..." : "Generera"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
