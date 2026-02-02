import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { createWorkbook, addJsonSheet, downloadWorkbook } from '@/lib/excelUtils';

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
      const wb = createWorkbook();

      // Add sheets for each data type
      if (profile) {
        addJsonSheet(wb, 'Profil', [profile]);
      }

      if (properties && properties.length > 0) {
        addJsonSheet(wb, 'Fastigheter', properties);
      }

      if (components && components.length > 0) {
        addJsonSheet(wb, 'Komponenter', components);
      }

      if (workOrders && workOrders.length > 0) {
        addJsonSheet(wb, 'Arbetsordrar', workOrders);
      }

      if (projects && projects.length > 0) {
        addJsonSheet(wb, 'Projekt', projects);
      }

      if (todos && todos.length > 0) {
        addJsonSheet(wb, 'Todos', todos);
      }

      // Download the file
      await downloadWorkbook(wb, `Min_Data_GDPR_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
      
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
