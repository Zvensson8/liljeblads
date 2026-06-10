import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { createWorkbook, addJsonSheet, downloadWorkbook } from '@/lib/excelUtils';
import jsPDF from 'jspdf';
type JsPdfWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
import {
  profileService,
  propertyService,
  componentService,
  workOrderService,
  projectService,
  todoService,
} from '@/services/supabase';

type ExportFormat = 'xlsx' | 'pdf';

const fetchUserData = async (userId: string) => {
  const [profile, properties, components, workOrders, projects, todos] = await Promise.all([
    profileService.getById(userId),
    propertyService.list({ ownerId: userId } as never).catch(() => []),
    componentService.list().catch(() => []),
    workOrderService.list().catch(() => []),
    projectService.list().catch(() => []),
    todoService.list().catch(() => []),
  ]);

  return { profile, properties, components, workOrders, projects, todos };
};


const exportAsXlsx = async (data: Awaited<ReturnType<typeof fetchUserData>>) => {
  const wb = createWorkbook();
  if (data.profile) addJsonSheet(wb, 'Profil', [data.profile]);
  if (data.properties?.length) addJsonSheet(wb, 'Fastigheter', data.properties);
  if (data.components?.length) addJsonSheet(wb, 'Komponenter', data.components);
  if (data.workOrders?.length) addJsonSheet(wb, 'Arbetsordrar', data.workOrders);
  if (data.projects?.length) addJsonSheet(wb, 'Projekt', data.projects);
  if (data.todos?.length) addJsonSheet(wb, 'Todos', data.todos);
  await downloadWorkbook(wb, `Min_Data_GDPR_Export_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
};

const addPdfTable = (doc: jsPDF, title: string, records: Record<string, any>[], startY: number): number => {
  if (!records.length) return startY;

  const headers = Object.keys(records[0]);
  const body = records.map(r => headers.map(h => {
    const v = r[h];
    return v === null || v === undefined ? '-' : String(v).substring(0, 60);
  }));

  if (startY > 250) {
    doc.addPage();
    startY = 20;
  }

  doc.setFontSize(13);
  doc.text(title, 14, startY);

  autoTable(doc, {
    startY: startY + 4,
    head: [headers],
    body,
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246], fontSize: 7 },
    styles: { fontSize: 6, cellPadding: 2 },
    columnStyles: headers.reduce((acc, _, i) => ({ ...acc, [i]: { cellWidth: 'auto' } }), {}),
  });

  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
};

const exportAsPdf = (data: Awaited<ReturnType<typeof fetchUserData>>) => {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(18);
  doc.text('GDPR Dataexport', 14, 20);
  doc.setFontSize(10);
  doc.text(`Genererad: ${format(new Date(), 'PPP', { locale: sv })}`, 14, 28);

  let y = 38;
  if (data.profile) y = addPdfTable(doc, 'Profil', [data.profile], y);
  if (data.properties?.length) y = addPdfTable(doc, 'Fastigheter', data.properties, y);
  if (data.components?.length) y = addPdfTable(doc, 'Komponenter', data.components, y);
  if (data.workOrders?.length) y = addPdfTable(doc, 'Arbetsordrar', data.workOrders, y);
  if (data.projects?.length) y = addPdfTable(doc, 'Projekt', data.projects, y);
  if (data.todos?.length) y = addPdfTable(doc, 'Todos', data.todos, y);

  doc.save(`Min_Data_GDPR_Export_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};

export const GDPRDataExport = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState<ExportFormat | null>(null);

  const handleExport = async (fmt: ExportFormat) => {
    if (!user) {
      toast.error('Du måste vara inloggad');
      return;
    }
    setLoading(fmt);
    try {
      const data = await fetchUserData(user.id);
      if (fmt === 'xlsx') {
        await exportAsXlsx(data);
      } else {
        exportAsPdf(data);
      }
      toast.success('Data exporterad!');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Kunde inte exportera data');
    } finally {
      setLoading(null);
    }
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>Exportera din data</CardTitle>
        <CardDescription>
          Enligt GDPR har du rätt att få en kopia av all data vi lagrar om dig
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => handleExport('xlsx')} disabled={!!loading}>
            {loading === 'xlsx' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Exportera som Excel
          </Button>
          <Button variant="outline" onClick={() => handleExport('pdf')} disabled={!!loading}>
            {loading === 'pdf' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            Exportera som PDF
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          Exporten inkluderar din profil, fastigheter, komponenter, arbetsordrar, projekt och todos.
        </p>
      </CardContent>
    </Card>
  );
};
