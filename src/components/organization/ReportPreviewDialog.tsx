import { useState, useEffect } from 'react';
import { getErrorMessage } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePreviewReport } from '@/hooks/useEdgeFunctions';
import { toast } from 'sonner';
import { ReportType } from '@/types/notifications';

interface ReportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportType: ReportType | null;
  onMarkAsPreviewed: (reportType: ReportType) => void;
}

const reportTitles: Record<ReportType, string> = {
  project_summary: 'Månatlig projektsammanfattning',
  workorder_summary: 'Månatlig arbetsorderrapport',
  maintenance_reminders: 'Veckovisa underhållspåminnelser',
  maintenance_history: 'Årlig underhållshistorik'
};

export function ReportPreviewDialog({ open, onOpenChange, reportType, onMarkAsPreviewed }: ReportPreviewDialogProps) {
  const { user } = useAuth();
  const previewReport = usePreviewReport();
  const [loading, setLoading] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string>('');

  useEffect(() => {
    if (open && reportType) {
      const fetchPreview = async () => {
        setLoading(true);
        setHtmlContent('');
        try {
          if (!user) {
            toast.error('Du måste vara inloggad');
            return;
          }

          const data = await previewReport.mutateAsync({
            reportType,
            userId: user.id,
          }) as { html?: string };

          if (!data?.html) {
            throw new Error('Ingen HTML returnerad från förhandsvisningen');
          }

          setHtmlContent(data.html);
        } catch (error: unknown) {
          console.error('Error generating preview:', error);
          toast.error(`Kunde inte generera förhandsvisning: ${getErrorMessage(error)}`);
        } finally {
          setLoading(false);
        }
      };
      
      fetchPreview();
    }
  }, [open, reportType]);

  const handleMarkAsPreviewed = () => {
    if (reportType) {
      onMarkAsPreviewed(reportType);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Förhandsvisning: {reportType ? reportTitles[reportType] : ''}</DialogTitle>
          <DialogDescription>
            Så här kommer din rapport att se ut när den skickas via e-post
          </DialogDescription>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Genererar förhandsvisning...</span>
          </div>
        ) : (
          <ScrollArea className="flex-1 border rounded-md">
            <iframe
              srcDoc={htmlContent}
              className="w-full h-[500px]"
              sandbox="allow-same-origin"
              title="Report Preview"
            />
          </ScrollArea>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Stäng
          </Button>
          <Button onClick={handleMarkAsPreviewed} disabled={loading}>
            <Check className="h-4 w-4 mr-2" />
            Aktivera automatiska rapporter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
