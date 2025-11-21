import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export const GDPRDataExport = () => {
  const [loading, setLoading] = useState(false);

  const handleExportData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Fetch all user data from various tables
      const [
        { data: profile },
        { data: properties },
        { data: components },
        { data: workOrders },
        { data: projects },
        { data: todos },
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('properties').select('*').eq('owner_id', user.id),
        supabase.from('components').select('*').eq('property_id', user.id),
        supabase.from('work_orders').select('*'),
        supabase.from('projects').select('*'),
        supabase.from('property_todos').select('*'),
      ]);

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Add sheets for each data type
      if (profile) {
        const profileWs = XLSX.utils.json_to_sheet([profile]);
        XLSX.utils.book_append_sheet(wb, profileWs, 'Profil');
      }

      if (properties && properties.length > 0) {
        const propertiesWs = XLSX.utils.json_to_sheet(properties);
        XLSX.utils.book_append_sheet(wb, propertiesWs, 'Fastigheter');
      }

      if (components && components.length > 0) {
        const componentsWs = XLSX.utils.json_to_sheet(components);
        XLSX.utils.book_append_sheet(wb, componentsWs, 'Komponenter');
      }

      if (workOrders && workOrders.length > 0) {
        const workOrdersWs = XLSX.utils.json_to_sheet(workOrders);
        XLSX.utils.book_append_sheet(wb, workOrdersWs, 'Arbetsordrar');
      }

      if (projects && projects.length > 0) {
        const projectsWs = XLSX.utils.json_to_sheet(projects);
        XLSX.utils.book_append_sheet(wb, projectsWs, 'Projekt');
      }

      if (todos && todos.length > 0) {
        const todosWs = XLSX.utils.json_to_sheet(todos);
        XLSX.utils.book_append_sheet(wb, todosWs, 'Todos');
      }

      // Download the file
      XLSX.writeFile(wb, `Min_Data_GDPR_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
      
      toast.success('Data exporterad!');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Kunde inte exportera data');
    } finally {
      setLoading(false);
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
        <Button onClick={handleExportData} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Exporterar...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Exportera all min data
            </>
          )}
        </Button>
        <p className="text-sm text-muted-foreground mt-4">
          Exporten inkluderar din profil, fastigheter, komponenter, arbetsordrar, projekt och todos i Excel-format.
        </p>
      </CardContent>
    </Card>
  );
};
