import { useState, useRef } from 'react';
import { storageService } from '@/services/supabase';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { useCreateMaintenanceHistory } from '@/hooks/useMaintenanceHistory';
import { useCreateMaintenanceDocument } from '@/hooks/useMaintenanceDocuments';
import { useCreateManualPlanItem } from '@/hooks/useMaintenancePlans';
import { earliestPlanQuarter } from '@/lib/maintenancePlanEngine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Wrench, Upload, X, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface QuickServiceButtonProps {
  componentId: string;
  componentName: string;
  onSuccess?: () => void;
}

export const QuickServiceButton = ({
  componentId,
  componentName,
  onSuccess,
}: QuickServiceButtonProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionType, setActionType] = useState('Service');
  const [performedDate, setPerformedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [supplier, setSupplier] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [addToPlan, setAddToPlan] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createMaintenance = useCreateMaintenanceHistory();
  const createMaintenanceDoc = useCreateMaintenanceDocument();
  const createManual = useCreateManualPlanItem();

  const resetForm = () => {
    setActionType('Service');
    setPerformedDate(new Date().toISOString().split('T')[0]);
    setSelectedFile(null);
    setSupplier('');
    setCost('');
    setNotes('');
    setRecommendations('');
    setAddToPlan(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      toast.error('Filen är för stor', { description: 'Max 20 MB' });
      return;
    }

    setSelectedFile(file);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const recLines = recommendations
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const notesParts = [notes.trim(), recLines.length ? `Rekommendationer:\n${recLines.join('\n')}` : '']
        .filter(Boolean)
        .join('\n\n');

      const maintenanceRecord = await createMaintenance.mutateAsync({
        component_id: componentId,
        action_type: actionType,
        performed_date: performedDate,
        supplier: supplier.trim() || null,
        cost: cost === '' ? null : Number(cost),
        notes: notesParts || null,
        category: 'planned',
      });

      if (selectedFile && maintenanceRecord) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${maintenanceRecord.id}/${crypto.randomUUID()}.${fileExt}`;

        try {
          await storageService.upload('maintenance-documents', fileName, selectedFile);
        } catch (uploadError: unknown) {
          console.error('Upload error:', uploadError);
          toast.error('Service registrerad men dokumentet kunde inte laddas upp', {
            description: getErrorMessage(uploadError),
          });
        }

        try {
          const publicUrl = storageService.getPublicUrl('maintenance-documents', fileName);
          await createMaintenanceDoc.mutateAsync({
            maintenance_history_id: maintenanceRecord.id,
            file_url: publicUrl,
            file_name: selectedFile.name,
            file_size: selectedFile.size,
            mime_type: selectedFile.type,
          });
        } catch (docError: unknown) {
          console.error('Doc record error:', docError);
        }
      }

      if (addToPlan && recLines.length > 0) {
        const { data: component } = await supabase
          .from('components')
          .select('property_id')
          .eq('id', componentId)
          .maybeSingle();
        const propertyId = component?.property_id;
        if (propertyId) {
          const { data: plan } = await supabase
            .from('maintenance_plans')
            .select('id')
            .eq('property_id', propertyId)
            .eq('status', 'active')
            .order('generated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (plan?.id) {
            const start = earliestPlanQuarter();
            for (const title of recLines) {
              await createManual.mutateAsync({
                planId: plan.id,
                propertyId,
                title,
                year: start.year,
                quarter: start.quarter,
                estimated_cost: null,
                notes: `Från service ${performedDate} · ${componentName}`,
              });
            }
          }
        }
      }

      toast.success('Service registrerad', {
        description: `${actionType} registrerad för ${componentName}`,
      });

      setOpen(false);
      resetForm();
      onSuccess?.();
    } catch (error: unknown) {
      toast.error('Kunde inte registrera service', {
        description: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <Wrench className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Registrera service</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Registrera service</DialogTitle>
          <DialogDescription>
            Utförd service för {componentName}. Anmärkningar och rekommendationer
            sparas på historiken.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quickAction">Åtgärd *</Label>
              <Input
                id="quickAction"
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                placeholder="Service, Byte, Inspektion..."
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickDate">Datum *</Label>
              <Input
                id="quickDate"
                type="date"
                value={performedDate}
                onChange={(e) => setPerformedDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quickSupplier">Leverantör</Label>
              <Input
                id="quickSupplier"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickCost">Kostnad (kr)</Label>
              <Input
                id="quickCost"
                type="number"
                min={0}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quickNotes">Anmärkningar</Label>
            <Textarea
              id="quickNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quickRecs">Rekommenderade åtgärder</Label>
            <Textarea
              id="quickRecs"
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              rows={3}
              placeholder="En åtgärd per rad"
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={addToPlan}
                onCheckedChange={(v) => setAddToPlan(v === true)}
                disabled={!recommendations.trim()}
              />
              Lägg rekommendationer på underhållsplanen
            </label>
          </div>

          <div className="space-y-2">
            <Label>Serviceprotokoll (valfritt)</Label>
            {selectedFile ? (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg border">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 flex-shrink-0 text-primary" />
                  <span className="text-sm truncate">{selectedFile.name}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    ({formatFileSize(selectedFile.size)})
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={handleRemoveFile}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                className="border-2 border-dashed rounded-lg p-4 text-center hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Klicka för att välja fil
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, Word, Excel, bilder (max 20 MB)
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sparar...
              </>
            ) : (
              <>
                <Wrench className="h-4 w-4 mr-2" />
                Registrera service
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
