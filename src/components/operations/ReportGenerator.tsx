import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FileText, Download } from "lucide-react";
import {
  generateYearReport,
  generateCategoryReport,
  generateDeviationReport,
} from "@/lib/reportUtils";

interface ReportGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  year: number;
}

export function ReportGenerator({
  open,
  onOpenChange,
  propertyId,
  year: initialYear,
}: ReportGeneratorProps) {
  const [reportType, setReportType] = useState<string>("year");
  const [year, setYear] = useState<number>(initialYear);
  const [quarter, setQuarter] = useState<string>("Q1");
  const [format, setFormat] = useState<"excel" | "pdf">("excel");
  const [threshold, setThreshold] = useState<number>(20);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      // For now, use a placeholder property name
      const propertyName = "Fastighet";
      
      switch (reportType) {
        case "year":
          await generateYearReport(propertyId, propertyName, year, format);
          toast.success("Årsrapport genererad");
          break;
        case "quarter":
          await generateCategoryReport(
            propertyId,
            propertyName,
            year,
            quarter,
            format
          );
          toast.success("Kvartalsrapport genererad");
          break;
        case "category":
          await generateCategoryReport(
            propertyId,
            propertyName,
            year,
            quarter,
            format
          );
          toast.success("Kategoriserad rapport genererad");
          break;
        case "deviation":
          await generateDeviationReport(
            propertyId,
            propertyName,
            year,
            threshold / 100,
            format
          );
          toast.success("Avvikelserapport genererad");
          break;
      }
      onOpenChange(false);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || "Kunde inte generera rapport");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby="report-generator-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Generera rapport
          </DialogTitle>
          <DialogDescription id="report-generator-description" className="sr-only">
            Välj rapportformat och generera rapport
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="report-type">Rapporttyp</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger id="report-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="year">Årsrapport</SelectItem>
                <SelectItem value="quarter">Kvartalsrapport</SelectItem>
                <SelectItem value="category">Kategoriserad analys</SelectItem>
                <SelectItem value="deviation">Avvikelseanalys</SelectItem>
              </SelectContent>
            </Select>
          </div>

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

          {(reportType === "quarter" || reportType === "category") && (
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

          {reportType === "deviation" && (
            <div>
              <Label htmlFor="threshold">
                Tröskelvärde för avvikelse (%)
              </Label>
              <Input
                id="threshold"
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(parseInt(e.target.value))}
                min={0}
                max={100}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Visa uppgifter med avvikelse större än {threshold}%
              </p>
            </div>
          )}

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

          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <h4 className="font-semibold mb-2">Beskrivning:</h4>
            {reportType === "year" && (
              <p>
                Årsrapport innehåller sammanfattning och detaljerad information
                för alla fyra kvartal i det valda året.
              </p>
            )}
            {reportType === "quarter" && (
              <p>
                Kvartalsrapport innehåller detaljerad information för det valda
                kvartalet.
              </p>
            )}
            {reportType === "category" && (
              <p>
                Kategoriserad analys grupperar uppgifter per kategori och visar
                completion rate för varje kategori.
              </p>
            )}
            {reportType === "deviation" && (
              <p>
                Avvikelseanalys visar uppgifter där redovisat antal avviker
                betydligt från planerat antal.
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
          <Button onClick={handleGenerate} disabled={loading}>
            <Download className="w-4 h-4 mr-2" />
            {loading ? "Genererar..." : "Generera"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
