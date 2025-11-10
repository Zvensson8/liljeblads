import { useState, useEffect } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileDown, Loader2, FileText, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface Property {
  id: string;
  name: string;
}

interface RecurringCostReportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RecurringCostReport({ open, onOpenChange }: RecurringCostReportProps) {
  const { organization } = useOrganization();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [startQuarter, setStartQuarter] = useState("");
  const [endQuarter, setEndQuarter] = useState("");
  const [reportData, setReportData] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (organization && open) {
      fetchProperties();
      // Set default quarters
      const now = new Date();
      const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
      const currentYear = now.getFullYear();
      setStartQuarter(`${currentYear}-Q${currentQuarter}`);
      setEndQuarter(`${currentYear + 1}-Q${currentQuarter}`);
    }
  }, [organization, open]);

  const fetchProperties = async () => {
    if (!organization) return;

    try {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name")
        .eq("organization_id", organization.id)
        .order("name");

      if (error) throw error;
      setProperties(data || []);
    } catch (error) {
      console.error("Error fetching properties:", error);
    }
  };

  const generateQuarters = () => {
    const quarters = [];
    const currentYear = new Date().getFullYear();
    
    for (let year = currentYear; year <= currentYear + 10; year++) {
      for (let q = 1; q <= 4; q++) {
        quarters.push(`${year}-Q${q}`);
      }
    }
    
    return quarters;
  };

  const handleGenerate = async () => {
    if (!organization) {
      toast.error("Ingen organisation vald");
      return;
    }

    setIsGenerating(true);
    try {
      // Fetch all recurring costs for the organization
      let query = supabase
        .from("property_recurring_costs")
        .select(`
          *,
          property:properties!inner(id, name, organization_id),
          account_code:account_codes(code, description)
        `)
        .eq("property.organization_id", organization.id);

      if (selectedProperty !== "all") {
        query = query.eq("property_id", selectedProperty);
      }

      const { data, error } = await query;
      if (error) throw error;

      console.log("Fetched recurring costs:", data);

      // Process and group data by quarter
      const grouped: any = {};
      
      if (!data || data.length === 0) {
        toast.info("Inga återkommande kostnader hittades för vald period");
        setIsGenerating(false);
        return;
      }

      console.log("Processing costs for quarters:", startQuarter, "to", endQuarter);
      
      data?.forEach((cost: any) => {
        // Skip if missing required data
        if (!cost.last_payment_date || !cost.base_interval_months) {
          console.warn("Skipping cost due to missing data:", cost);
          return;
        }

        // Calculate projected payments based on interval
        const projections = calculateProjections(
          cost,
          startQuarter,
          endQuarter
        );

        console.log(`Projections for ${cost.description}:`, projections);

        projections.forEach((projection: any) => {
          if (!grouped[projection.quarter]) {
            grouped[projection.quarter] = {
              quarter: projection.quarter,
              properties: {},
              total: 0,
            };
          }

          const propertyName = cost.property?.name || "Okänd";
          if (!grouped[projection.quarter].properties[propertyName]) {
            grouped[projection.quarter].properties[propertyName] = {
              accounts: {},
              total: 0,
            };
          }

          const accountKey = `${cost.account_code?.code} - ${cost.account_code?.description}`;
          if (!grouped[projection.quarter].properties[propertyName].accounts[accountKey]) {
            grouped[projection.quarter].properties[propertyName].accounts[accountKey] = [];
          }

          grouped[projection.quarter].properties[propertyName].accounts[accountKey].push({
            description: cost.description,
            amount: cost.amount,
            hasVariation: cost.interval_variation_months > 0,
          });

          grouped[projection.quarter].properties[propertyName].total += cost.amount;
          grouped[projection.quarter].total += cost.amount;
        });
      });

      setReportData(grouped);
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Kunde inte generera rapport");
    } finally {
      setIsGenerating(false);
    }
  };

  const calculateProjections = (cost: any, startQ: string, endQ: string) => {
    const projections = [];
    
    if (!cost.last_payment_date || !cost.base_interval_months) {
      return projections;
    }

    const lastPayment = new Date(cost.last_payment_date);
    const startDate = quarterToDate(startQ);
    const endDate = quarterToDate(endQ);

    // Start from last payment and project forward
    let currentDate = new Date(lastPayment);
    let iterations = 0;
    const maxIterations = 100; // Prevent infinite loops
    
    while (currentDate <= endDate && iterations < maxIterations) {
      iterations++;
      currentDate = new Date(currentDate);
      currentDate.setMonth(currentDate.getMonth() + cost.base_interval_months);
      
      if (currentDate >= startDate && currentDate <= endDate) {
        const quarter = dateToQuarter(currentDate);
        projections.push({ quarter });
      }
    }

    return projections;
  };

  const quarterToDate = (quarter: string) => {
    const [year, q] = quarter.split("-Q");
    const month = (parseInt(q) - 1) * 3;
    return new Date(parseInt(year), month, 1);
  };

  const dateToQuarter = (date: Date) => {
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `${date.getFullYear()}-Q${quarter}`;
  };

  const exportToPDF = () => {
    if (!reportData) return;

    const doc = new jsPDF();
    let yPos = 20;

    // Title
    doc.setFontSize(16);
    doc.text("Rapport - Återkommande Kostnader", 14, yPos);
    yPos += 10;

    doc.setFontSize(10);
    doc.text(`Period: ${startQuarter} - ${endQuarter}`, 14, yPos);
    yPos += 5;
    
    if (selectedProperty !== "all") {
      const propertyName = properties.find(p => p.id === selectedProperty)?.name || "";
      doc.text(`Fastighet: ${propertyName}`, 14, yPos);
    } else {
      doc.text("Fastighet: Alla fastigheter", 14, yPos);
    }
    yPos += 10;

    // Generate tables for each quarter
    Object.values(reportData).forEach((quarterData: any) => {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.text(`${quarterData.quarter} - Total: ${quarterData.total.toLocaleString("sv-SE")} kr`, 14, yPos);
      yPos += 8;

      Object.entries(quarterData.properties).forEach(([propertyName, propertyData]: any) => {
        const tableData: any[] = [];
        
        Object.entries(propertyData.accounts).forEach(([account, costs]: any) => {
          costs.forEach((cost: any) => {
            tableData.push([
              account,
              cost.description + (cost.hasVariation ? " (±variation)" : ""),
              `${cost.amount.toLocaleString("sv-SE")} kr`
            ]);
          });
        });

        // Add subtotal
        tableData.push([
          { content: `Delsumma ${propertyName}`, colSpan: 2, styles: { fontStyle: 'bold' } },
          { content: `${propertyData.total.toLocaleString("sv-SE")} kr`, styles: { fontStyle: 'bold' } }
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Konto', 'Beskrivning', 'Belopp']],
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [66, 66, 66] },
          margin: { left: 14 },
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      });

      yPos += 5;
    });

    doc.save(`återkommande-kostnader-${startQuarter}-${endQuarter}.pdf`);
    toast.success("PDF-rapport genererad");
  };

  const exportToExcel = () => {
    if (!reportData) return;

    const worksheetData: any[] = [];

    // Add header
    worksheetData.push([
      `Återkommande Kostnader - ${startQuarter} till ${endQuarter}`,
    ]);
    worksheetData.push([]);

    if (selectedProperty !== "all") {
      const propertyName = properties.find(p => p.id === selectedProperty)?.name || "";
      worksheetData.push([`Fastighet: ${propertyName}`]);
    } else {
      worksheetData.push(["Fastighet: Alla fastigheter"]);
    }
    worksheetData.push([]);

    // Add data for each quarter
    Object.values(reportData).forEach((quarterData: any) => {
      worksheetData.push([
        `${quarterData.quarter}`,
        "",
        "",
        `Total: ${quarterData.total.toLocaleString("sv-SE")} kr`
      ]);
      worksheetData.push([]);

      Object.entries(quarterData.properties).forEach(([propertyName, propertyData]: any) => {
        worksheetData.push(["Konto", "Beskrivning", "Belopp"]);

        Object.entries(propertyData.accounts).forEach(([account, costs]: any) => {
          costs.forEach((cost: any) => {
            worksheetData.push([
              account,
              cost.description + (cost.hasVariation ? " (±variation)" : ""),
              cost.amount
            ]);
          });
        });

        worksheetData.push([
          `Delsumma ${propertyName}`,
          "",
          propertyData.total
        ]);
        worksheetData.push([]);
      });
    });

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Återkommande Kostnader");

    XLSX.writeFile(workbook, `återkommande-kostnader-${startQuarter}-${endQuarter}.xlsx`);
    toast.success("Excel-rapport genererad");
  };

  const quarters = generateQuarters();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rapport - Återkommande Kostnader</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-3 mb-4">
          <div>
            <Label>Fastighet</Label>
            <Select value={selectedProperty} onValueChange={setSelectedProperty}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla fastigheter</SelectItem>
                {properties.map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Från kvartal</Label>
            <Select value={startQuarter} onValueChange={setStartQuarter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {quarters.map((q) => (
                  <SelectItem key={q} value={q}>
                    {q}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Till kvartal</Label>
            <Select value={endQuarter} onValueChange={setEndQuarter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {quarters.map((q) => (
                  <SelectItem key={q} value={q}>
                    {q}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleGenerate} disabled={isGenerating} className="flex-1">
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Genererar...
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-2" />
                Generera Rapport
              </>
            )}
          </Button>
          
          {reportData && (
            <>
              <Button onClick={exportToPDF} variant="outline">
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </Button>
              <Button onClick={exportToExcel} variant="outline">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
            </>
          )}
        </div>

        {reportData && (
          <div className="space-y-6 mt-6">
            {Object.values(reportData).map((quarterData: any) => (
              <Card key={quarterData.quarter}>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>{quarterData.quarter}</CardTitle>
                    <span className="text-2xl font-bold">
                      {quarterData.total.toLocaleString("sv-SE")} kr
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  {Object.entries(quarterData.properties).map(([propertyName, propertyData]: any) => (
                    <div key={propertyName} className="mb-4">
                      <h4 className="font-semibold mb-2">{propertyName}</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Konto</TableHead>
                            <TableHead>Beskrivning</TableHead>
                            <TableHead className="text-right">Belopp</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(propertyData.accounts).map(([account, costs]: any) => (
                            costs.map((cost: any, idx: number) => (
                              <TableRow key={`${account}-${idx}`}>
                                {idx === 0 && (
                                  <TableCell rowSpan={costs.length}>{account}</TableCell>
                                )}
                                <TableCell>
                                  {cost.description}
                                  {cost.hasVariation && (
                                    <span className="text-xs text-muted-foreground ml-2">
                                      (±variation)
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {cost.amount.toLocaleString("sv-SE")} kr
                                </TableCell>
                              </TableRow>
                            ))
                          ))}
                          <TableRow className="font-semibold">
                            <TableCell colSpan={2}>Delsumma {propertyName}</TableCell>
                            <TableCell className="text-right">
                              {propertyData.total.toLocaleString("sv-SE")} kr
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
