import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { createWorkbook, addJsonSheet, downloadWorkbook } from './excelUtils';

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
  const maintenanceData: any[] = [];
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
  let startY = (doc as any).lastAutoTable.finalY + 15;
  
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
      
      startY = (doc as any).lastAutoTable.finalY + 15;
    }
  });
  
  doc.save(filename);
};
