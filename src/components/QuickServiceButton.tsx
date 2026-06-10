import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { storageService } from '@/services/supabase';
import { getErrorMessage } from '@/lib/utils';
import { useCreateMaintenanceHistory } from '@/hooks/useMaintenanceHistory';
import { useCreateMaintenanceDocument } from '@/hooks/useMaintenanceDocuments';
import { useDriftTasks } from '@/hooks/useDriftTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Wrench, Upload, X, FileText, Loader2, Link2 } from 'lucide-react';
import { toast } from 'sonner';

interface QuickServiceButtonProps {
  componentId: string;
  componentName: string;
  onSuccess?: () => void;
}

interface DriftTask {
  id: string;
  name: string;
  planned_count: number;
  reported_count: number;
}

function getQuarterFromDate(date: string): { quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'; year: number } {
  const d = new Date(date);
  const month = d.getMonth();
  const year = d.getFullYear();
  
  if (month < 3) return { quarter: 'Q1', year };
  if (month < 6) return { quarter: 'Q2', year };
  if (month < 9) return { quarter: 'Q3', year };
  return { quarter: 'Q4', year };
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
  const [selectedDriftTaskId, setSelectedDriftTaskId] = useState<string>('');
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { quarter, year } = getQuarterFromDate(performedDate);

  const { data: driftTasksData = [], isLoading: loadingTasks } = useDriftTasks(
    open && propertyId ? { propertyId, quarter, year } : ({} as any),
  );
  const driftTasks = (open && propertyId ? (driftTasksData as DriftTask[]) : []).slice().sort(
    (a, b) => a.name.localeCompare(b.name),
  );

  const createMaintenance = useCreateMaintenanceHistory();
  const createMaintenanceDoc = useCreateMaintenanceDocument();

  const resetForm = () => {
    setActionType('Service');
    setPerformedDate(new Date().toISOString().split('T')[0]);
    setSelectedFile(null);
    setSelectedDriftTaskId('');
  };

  // Resolve component's property_id (single lookup, no list hook needed)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('components')
        .select('property_id')
        .eq('id', componentId)
        .single();
      if (!cancelled && !error && data) setPropertyId((data as any).property_id);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, componentId]);


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
      // 1. Create the maintenance history record with optional drift_task_id
      const maintenanceRecord = await createMaintenance.mutateAsync({
        component_id: componentId,
        action_type: actionType,
        performed_date: performedDate,
        drift_task_id: selectedDriftTaskId || null,
      } as any);


      // 2. If a file was selected, upload it
      if (selectedFile && maintenanceRecord) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${maintenanceRecord.id}/${crypto.randomUUID()}.${fileExt}`;

        try {
          await storageService.upload('maintenance-documents', fileName, selectedFile);
        } catch (uploadError: any) {
          console.error('Upload error:', uploadError);
          toast.error('Service registrerad men dokumentet kunde inte laddas upp', {
            description: uploadError.message,
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
          } as any);
        } catch (docError: any) {
          console.error('Doc record error:', docError);
        }
      }


      const selectedTask = driftTasks.find(t => t.id === selectedDriftTaskId);
      toast.success('Service registrerad', {
        description: `${actionType} registrerad för ${componentName}${selectedTask ? ` (kopplad till "${selectedTask.name}")` : ''}`,
      });
      
      setOpen(false);
      resetForm();
      onSuccess?.();
    } catch (error: any) {
      toast.error('Kunde inte registrera service', {
        description: error.message,
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
            Registrera utförd service för {componentName}
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

          {/* Drift task linking */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Koppla till driftuppföljning
            </Label>
            {loadingTasks ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Laddar uppgifter...
              </div>
            ) : driftTasks.length > 0 ? (
              <Select value={selectedDriftTaskId} onValueChange={setSelectedDriftTaskId}>
                <SelectTrigger>
                  <SelectValue placeholder={`Välj uppgift för ${quarter} ${year} (valfritt)`} />
                </SelectTrigger>
                <SelectContent>
                  {driftTasks.map((task) => (
                    <SelectItem key={task.id} value={task.id}>
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span>{task.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({task.reported_count}/{task.planned_count} utförda)
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground py-1">
                Inga driftuppgifter för {quarter} {year}
              </p>
            )}
          </div>

          {/* Document upload section */}
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
