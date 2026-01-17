import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

const categories = [
  'Drift',
  'Renovering',
  'Förebyggande underhåll',
  'Akut reparation',
  'Inspektion',
  'Annat'
];

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
  const [supplier, setSupplier] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState('Drift');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setActionType('Service');
    setPerformedDate(new Date().toISOString().split('T')[0]);
    setSupplier('');
    setCost('');
    setNotes('');
    setCategory('Drift');
    setSelectedFile(null);
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
      // 1. Create the maintenance history record
      const { data: maintenanceRecord, error: maintenanceError } = await supabase
        .from('maintenance_history')
        .insert({
          component_id: componentId,
          action_type: actionType,
          performed_date: performedDate,
          supplier: supplier || null,
          cost: cost ? parseFloat(cost) : null,
          notes: notes || null,
          category: category || null,
        })
        .select('id')
        .single();

      if (maintenanceError) throw maintenanceError;

      // 2. If a file was selected, upload it
      if (selectedFile && maintenanceRecord) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${maintenanceRecord.id}/${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('maintenance-documents')
          .upload(fileName, selectedFile);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          toast.error('Service registrerad men dokumentet kunde inte laddas upp', {
            description: uploadError.message
          });
        } else {
          const { data: urlData } = supabase.storage
            .from('maintenance-documents')
            .getPublicUrl(fileName);

          const { error: docError } = await supabase
            .from('maintenance_history_documents')
            .insert({
              maintenance_history_id: maintenanceRecord.id,
              file_url: urlData.publicUrl,
              file_name: selectedFile.name,
              file_size: selectedFile.size,
              mime_type: selectedFile.type
            });

          if (docError) {
            console.error('Doc record error:', docError);
          }
        }
      }

      toast.success('Service registrerad', {
        description: `${actionType} registrerad för ${componentName}${selectedFile ? ' med bifogat dokument' : ''}`,
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
      <DialogContent className="max-w-lg" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Registrera service</DialogTitle>
          <DialogDescription>
            Fyll i uppgifter om utförd service för {componentName}
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
              <Label htmlFor="quickSupplier">Leverantör/Utförare</Label>
              <Input
                id="quickSupplier"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="T.ex. Öhman Gruppen"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickCost">Kostnad (kr)</Label>
              <Input
                id="quickCost"
                type="number"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quickCategory">Kategori</Label>
            <select
              id="quickCategory"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quickNotes">Anteckningar</Label>
            <Textarea
              id="quickNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Övrig information..."
              rows={2}
            />
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
