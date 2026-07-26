import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { generateYearReport } from '@/lib/reportUtils';
import { exportComponentsToExcel } from '@/lib/exportUtils';
import { createWorkbook, addJsonSheet, downloadWorkbook } from '@/lib/excelUtils';
import type { Tables } from '@/integrations/supabase/types';

type ComponentRow = Tables<'components'> & {
  floors?: { name: string | null } | null;
  properties?: { name: string | null; address: string | null } | null;
};
type MaintenanceRow = Tables<'maintenance_history'>;
type WorkOrderRow = Tables<'work_orders'>;
type ProjectCostRow = Tables<'project_cost_items'> & {
  projects?: { name: string | null; property_id: string | null } | null;
};

interface Property {
  id: string;
  name: string;
}

interface ReportGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportType: string;
  reportName: string;
}

export const ReportGeneratorDialog = ({
  open,
  onOpenChange,
  reportType,
  reportName,
}: ReportGeneratorDialogProps) => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [quarter, setQuarter] = useState<string>('Q1');
  const [format, setFormat] = useState<'excel' | 'pdf'>('excel');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchProperties();
    }
  }, [open]);

  const fetchProperties = async () => {
    const { data, error } = await supabase
      .from('properties')
      .select('id, name')
      .order('name');

    if (!error && data) {
      setProperties(data);
      if (data.length > 0) {
        setSelectedProperty(data[0].id);
      }
    }
  };

  const handleGenerate = async () => {
    if (!selectedProperty) {
      toast.error('Välj en fastighet');
      return;
    }

    setLoading(true);

    try {
      const property = properties.find((p) => p.id === selectedProperty);
      if (!property) throw new Error('Fastighet hittades inte');

      switch (reportType) {
        case 'maintenance-overview':
        case 'property-status':
          await generatePropertyStatusReport(property);
          break;

        case 'workorder-summary':
          await generateWorkOrderReport(property);
          break;

        case 'budget-analysis':
        case 'cost-trends':
          await generateCostReport(property);
          break;

        default:
          // Default to year report
          await generateYearReport(
            selectedProperty,
            property.name,
            parseInt(year),
            format
          );
      }

      toast.success('Rapport genererad!');
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to generate report:', error);
      toast.error('Kunde inte generera rapporten');
    } finally {
      setLoading(false);
    }
  };

  const generatePropertyStatusReport = async (property: Property) => {
    const { data: components, error } = await supabase
      .from('components')
      .select(`
        *,
        floors (name),
        properties (name, address)
      `)
      .eq('property_id', property.id);

    if (error) throw error;

    // Get maintenance records for each component
    const maintenanceRecords: Record<string, MaintenanceRow[]> = {};
    
    if (components) {
      for (const comp of components as ComponentRow[]) {
        const { data: maintenance } = await supabase
          .from('maintenance_history')
          .select('*')
          .eq('component_id', comp.id)
          .order('performed_date', { ascending: false })
          .limit(10);

        if (maintenance) {
          maintenanceRecords[comp.id] = maintenance as MaintenanceRow[];
        }
      }

      const formattedComponents = (components as ComponentRow[]).map((c) => ({
        ...c,
        floor_name: c.floors?.name,
        property_name: c.properties?.name,
        property_address: c.properties?.address,
      }));

      exportComponentsToExcel(
        formattedComponents,
        maintenanceRecords,
        `Fastighetsstatus_${property.name}_${new Date().toISOString().split('T')[0]}.xlsx`
      );
    }
  };

  const generateWorkOrderReport = async (property: Property) => {
    const { data: workOrders, error } = await supabase
      .from('work_orders')
      .select(`
        *,
        properties (name)
      `)
      .eq('property_id', property.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (workOrders) {
      const wb = createWorkbook();
      const data = (workOrders as WorkOrderRow[]).map((wo) => ({
        'Åtgärd': wo.action,
        'Status': wo.status,
        'Prioritet': wo.priority,
        'Entreprenör': wo.contractor || '-',
        'Pris': wo.price || 0,
        'Förfallodatum': wo.due_date || '-',
        'Skapad': new Date(wo.created_at).toLocaleDateString('sv-SE'),
        'Kommentarer': wo.comments || '-',
      }));

      addJsonSheet(wb, 'Arbetsordrar', data);
      await downloadWorkbook(wb, `Arbetsordrar_${property.name}_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
  };

  const generateCostReport = async (property: Property) => {
    const { data: costs, error } = await supabase
      .from('project_cost_items')
      .select(`
        *,
        projects (name, property_id)
      `)
      .eq('projects.property_id', property.id)
      .order('cost_date', { ascending: false });

    if (error) throw error;

    if (costs) {
      const wb = createWorkbook();
      const data = (costs as ProjectCostRow[]).map((cost) => ({
        'Projekt': cost.projects?.name || '-',
        'Beskrivning': cost.description,
        'Belopp': cost.amount,
        'Kategori': cost.category || '-',
        'Aktör': cost.actor || '-',
        'Datum': new Date(cost.cost_date).toLocaleDateString('sv-SE'),
      }));

      addJsonSheet(wb, 'Kostnader', data);
      await downloadWorkbook(wb, `Kostnadsanalys_${property.name}_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Generera rapport: {reportName}</DialogTitle>
          <DialogDescription>
            Välj parametrar för rapporten
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Fastighet</Label>
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

          {(reportType === 'budget-analysis' || reportType === 'cost-trends') && (
            <div className="space-y-2">
              <Label>År</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2023, 2022, 2021, 2020].map((y) => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as 'excel' | 'pdf')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excel">Excel (XLSX)</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleGenerate} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Generera
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
