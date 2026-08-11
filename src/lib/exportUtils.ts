import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { createWorkbook, addJsonSheet, downloadWorkbook } from './excelUtils';

type JsPdfWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };


interface Component {
  id: string;
  name: string;
  type: string;
  status: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  room_zone: string | null;
  installation_year: number | null;
  registration_number: string | null;
  refrigerant_code: string | null;
  refrigerant_amount_kg: number | null;
  refrigerant_type: string | null;
  floor_name?: string;
  property_name?: string;
  property_address?: string;
}

interface MaintenanceRecord {
  action_type: string;
  performed_date: string;
  supplier: string | null;
  cost: number | null;
  notes: string | null;
}

export const exportComponentsToExcel = async (
  components: Component[],
  maintenanceRecords: Record<string, MaintenanceRecord[]>,
  filename: string
) => {
  const wb = createWorkbook();
  
  // Components sheet
  const componentsData = components.map(comp => ({
    'Beteckning': comp.name,
    'Reg.nr': comp.registration_number || '-',
    'Typ': comp.type,
    'Status': comp.status,
    'Fastighet': comp.property_name || '-',
    'Våning': comp.floor_name || '-',
    'Tillverkare': comp.manufacturer || '-',
    'Modell': comp.model || '-',
    'Serie-ID': comp.serial_number || '-',
    'Installationsår': comp.installation_year || '-',
    'Placering': comp.room_zone || '-',
    'Köldmediecode': comp.refrigerant_code || '-',
    'Fyllnadsmängd (kg)': comp.refrigerant_amount_kg || '-',
    'Köldmedietyp': comp.refrigerant_type || '-',
  }));
  
  addJsonSheet(wb, 'Komponenter', componentsData);
  
  // Maintenance history sheet
  const maintenanceData: Record<string, string | number>[] = [];
  components.forEach(comp => {
    const records = maintenanceRecords[comp.id] || [];
    records.forEach(record => {
      maintenanceData.push({
        'Komponent': comp.name,
        'Åtgärd': record.action_type,
        'Datum': format(new Date(record.performed_date), 'yyyy-MM-dd'),
        'Leverantör': record.supplier || '-',
        'Kostnad (kr)': record.cost || '-',
        'Anteckningar': record.notes || '-',
      });
    });
  });
  
  if (maintenanceData.length > 0) {
    addJsonSheet(wb, 'Underhållshistorik', maintenanceData);
  }
  
  await downloadWorkbook(wb, filename);
};

export const exportComponentsToPDF = (
  components: Component[],
  maintenanceRecords: Record<string, MaintenanceRecord[]>,
  title: string,
  filename: string
) => {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(18);
  doc.text(title, 14, 22);
  
  doc.setFontSize(11);
  doc.text(`Genererad: ${format(new Date(), 'PPP', { locale: sv })}`, 14, 30);
  
  // Components table
  const componentRows = components.map(comp => [
    comp.name,
    comp.type,
    comp.status,
    comp.manufacturer || '-',
    comp.model || '-',
    comp.installation_year || '-',
    comp.room_zone || '-',
  ]);
  
  autoTable(doc, {
    startY: 40,
    head: [['Beteckning', 'Typ', 'Status', 'Tillverkare', 'Modell', 'År', 'Placering']],
    body: componentRows,
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 8 },
  });
  
  // Maintenance history for each component
  let startY = (doc as JsPdfWithAutoTable).lastAutoTable.finalY + 15;
  
  components.forEach(comp => {
    const records = maintenanceRecords[comp.id] || [];
    if (records.length > 0) {
      if (startY > 250) {
        doc.addPage();
        startY = 20;
      }
      
      doc.setFontSize(12);
      doc.text(`Underhåll - ${comp.name}`, 14, startY);
      
      const maintenanceRows = records.map(record => [
        record.action_type,
        format(new Date(record.performed_date), 'yyyy-MM-dd'),
        record.supplier || '-',
        record.cost ? `${record.cost.toLocaleString('sv-SE')} kr` : '-',
        record.notes || '-',
      ]);
      
      autoTable(doc, {
        startY: startY + 5,
        head: [['Åtgärd', 'Datum', 'Leverantör', 'Kostnad', 'Anteckningar']],
        body: maintenanceRows,
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 8 },
      });
      
      startY = (doc as JsPdfWithAutoTable).lastAutoTable.finalY + 15;
    }
  });
  
  doc.save(filename);
};

const WORK_ORDER_STATUS_SV: Record<string, string> = {
  not_started: 'Ej påbörjad',
  awaiting_quote: 'Inväntar offert',
  ordered: 'Beställt',
  completed: 'Slutförd',
  archived: 'Arkiverad',
};

const WORK_ORDER_PRIORITY_SV: Record<string, string> = {
  low: 'Låg',
  medium: 'Medel',
  high: 'Hög',
};

export interface WorkOrderExportRow {
  action: string;
  status: string;
  priority?: string | null;
  contractor?: string | null;
  price?: number | null;
  due_date?: string | null;
  quarter?: string | null;
  comments?: string | null;
  property_name?: string | null;
  component_name?: string | null;
  created_at?: string | null;
}

/** Export filtered work orders to Excel (replaces global /reports summary). */
export const exportWorkOrdersToExcel = async (
  orders: WorkOrderExportRow[],
  filename?: string
) => {
  const wb = createWorkbook();
  const data = orders.map((wo) => ({
    Åtgärd: wo.action || '-',
    Status: WORK_ORDER_STATUS_SV[wo.status] || wo.status,
    Prioritet: WORK_ORDER_PRIORITY_SV[wo.priority || ''] || wo.priority || '-',
    Fastighet: wo.property_name || '-',
    Komponent: wo.component_name || '-',
    Entreprenör: wo.contractor || '-',
    'Pris (kr)': wo.price != null ? wo.price : '-',
    Förfallodatum: wo.due_date
      ? format(new Date(wo.due_date), 'yyyy-MM-dd')
      : '-',
    Kvartal: wo.quarter || '-',
    Kommentar: wo.comments || '-',
    Skapad: wo.created_at
      ? format(new Date(wo.created_at), 'yyyy-MM-dd')
      : '-',
  }));
  addJsonSheet(wb, 'Arbetsordrar', data.length ? data : [{ Åtgärd: '(inga rader)' }]);
  const name =
    filename ||
    `Arbetsordrar_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
  await downloadWorkbook(wb, name);
};

const PROJECT_STATUS_SV: Record<string, string> = {
  planned: 'Planerad',
  active: 'Aktiv',
  on_hold: 'Pausad',
  completed: 'Slutförd',
  cancelled: 'Avbruten',
  proposal: 'Förslag',
};

export interface ProjectExportRow {
  project_number?: string | null;
  name: string;
  type?: string | null;
  status?: string | null;
  property_name?: string | null;
  year?: number | null;
  start_quarter?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  budget?: number | null;
  forecast?: number | null;
  actual_cost?: number | null;
  description?: string | null;
}

/** Export filtered project list to Excel. */
export const exportProjectsToExcel = async (
  projects: ProjectExportRow[],
  filename?: string
) => {
  const wb = createWorkbook();
  const data = projects.map((p) => ({
    'Projektnr': p.project_number || '-',
    Namn: p.name,
    Typ: p.type || '-',
    Status: PROJECT_STATUS_SV[p.status || ''] || p.status || '-',
    Fastighet: p.property_name || '-',
    År: p.year ?? '-',
    Kvartal: p.start_quarter != null ? `Q${p.start_quarter}` : '-',
    Startdatum: p.start_date
      ? format(new Date(p.start_date), 'yyyy-MM-dd')
      : '-',
    Slutdatum: p.end_date
      ? format(new Date(p.end_date), 'yyyy-MM-dd')
      : '-',
    'Budget (kr)': p.budget ?? '-',
    'Prognos (kr)': p.forecast ?? '-',
    'Utfall (kr)': p.actual_cost ?? '-',
    Beskrivning: p.description || '-',
  }));
  addJsonSheet(wb, 'Projekt', data.length ? data : [{ Namn: '(inga rader)' }]);
  const name =
    filename || `Projekt_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
  await downloadWorkbook(wb, name);
};
