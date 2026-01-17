import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Trash2, Pencil, FileText, Upload, X, Download, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';

interface MaintenanceDocument {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

interface MaintenanceRecord {
  id: string;
  action_type: string;
  performed_date: string;
  supplier: string | null;
  cost: number | null;
  notes: string | null;
  category: string | null;
}

interface ServiceRecordCardProps {
  record: MaintenanceRecord;
  onUpdate: () => void;
  onDelete: () => void;
}

const categories = [
  'Drift',
  'Renovering',
  'Förebyggande underhåll',
  'Akut reparation',
  'Inspektion',
  'Annat'
];

export function ServiceRecordCard({ record, onUpdate, onDelete }: ServiceRecordCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [documents, setDocuments] = useState<MaintenanceDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  
  // Edit form state
  const [actionType, setActionType] = useState(record.action_type);
  const [performedDate, setPerformedDate] = useState(record.performed_date);
  const [supplier, setSupplier] = useState(record.supplier || '');
  const [cost, setCost] = useState(record.cost?.toString() || '');
  const [notes, setNotes] = useState(record.notes || '');
  const [category, setCategory] = useState(record.category || '');

  const fetchDocuments = async () => {
    setLoadingDocs(true);
    const { data, error } = await supabase
      .from('maintenance_history_documents')
      .select('*')
      .eq('maintenance_history_id', record.id)
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setDocuments(data);
    }
    setLoadingDocs(false);
  };

  const handleToggleDocuments = () => {
    if (!showDocuments) {
      fetchDocuments();
    }
    setShowDocuments(!showDocuments);
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    const { error } = await supabase
      .from('maintenance_history')
      .update({
        action_type: actionType,
        performed_date: performedDate,
        supplier: supplier || null,
        cost: cost ? parseFloat(cost) : null,
        notes: notes || null,
        category: category || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', record.id);

    if (error) {
      toast.error('Kunde inte spara ändringar', { description: error.message });
    } else {
      toast.success('Service uppdaterad');
      setIsEditing(false);
      onUpdate();
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    
    const { error } = await supabase
      .from('maintenance_history')
      .delete()
      .eq('id', record.id);

    if (error) {
      toast.error('Kunde inte ta bort service', { description: error.message });
    } else {
      toast.success('Service borttagen');
      onDelete();
    }
    setIsDeleting(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Max 20MB
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Filen är för stor', { description: 'Max 20 MB' });
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${record.id}/${crypto.randomUUID()}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('maintenance-documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('maintenance-documents')
        .getPublicUrl(fileName);

      // Save to database
      const { error: dbError } = await supabase
        .from('maintenance_history_documents')
        .insert({
          maintenance_history_id: record.id,
          file_url: urlData.publicUrl,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type
        });

      if (dbError) throw dbError;

      toast.success('Dokument uppladdat');
      fetchDocuments();
    } catch (error: any) {
      toast.error('Kunde inte ladda upp dokument', { description: error.message });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteDocument = async (doc: MaintenanceDocument) => {
    // Extract path from URL
    const urlParts = doc.file_url.split('/');
    const pathStartIndex = urlParts.findIndex(p => p === 'maintenance-documents') + 1;
    const filePath = urlParts.slice(pathStartIndex).join('/');

    try {
      // Delete from storage
      await supabase.storage
        .from('maintenance-documents')
        .remove([filePath]);

      // Delete from database
      const { error } = await supabase
        .from('maintenance_history_documents')
        .delete()
        .eq('id', doc.id);

      if (error) throw error;

      toast.success('Dokument borttaget');
      fetchDocuments();
    } catch (error: any) {
      toast.error('Kunde inte ta bort dokument', { description: error.message });
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <Card>
        <CardContent className="pt-4">
          <div className="flex justify-between items-start">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h4 className="font-semibold">{record.action_type}</h4>
                {record.category && (
                  <Badge variant="secondary" className="text-xs">
                    {record.category}
                  </Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  {format(new Date(record.performed_date), 'PPP', { locale: sv })}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {record.supplier && (
                  <div>
                    <span className="text-muted-foreground">Utförare: </span>
                    <span>{record.supplier}</span>
                  </div>
                )}
                {record.cost && (
                  <div>
                    <span className="text-muted-foreground">Kostnad: </span>
                    <span>{record.cost.toLocaleString('sv-SE')} kr</span>
                  </div>
                )}
              </div>
              {record.notes && (
                <p className="text-sm text-muted-foreground">{record.notes}</p>
              )}
              
              {/* Documents section */}
              <div className="pt-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleToggleDocuments}
                  className="gap-2 h-8 px-2"
                >
                  <FileText className="h-4 w-4" />
                  <span>Dokument {documents.length > 0 && `(${documents.length})`}</span>
                </Button>
                
                {showDocuments && (
                  <div className="mt-2 p-3 bg-muted/50 rounded-lg space-y-2">
                    {loadingDocs ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Laddar...
                      </div>
                    ) : (
                      <>
                        {documents.map(doc => (
                          <div 
                            key={doc.id} 
                            className="flex items-center justify-between bg-background p-2 rounded border"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                              <span className="text-sm truncate">{doc.file_name}</span>
                              {doc.file_size && (
                                <span className="text-xs text-muted-foreground flex-shrink-0">
                                  ({formatFileSize(doc.file_size)})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                asChild
                              >
                                <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteDocument(doc)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        
                        <div className="pt-2">
                          <Label 
                            htmlFor={`upload-${record.id}`}
                            className="cursor-pointer inline-flex items-center gap-2 text-sm text-primary hover:underline"
                          >
                            {uploading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                            {uploading ? 'Laddar upp...' : 'Ladda upp protokoll'}
                          </Label>
                          <input
                            id={`upload-${record.id}`}
                            type="file"
                            className="hidden"
                            onChange={handleFileUpload}
                            disabled={uploading}
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsEditing(true)}
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Ta bort service?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Detta kommer permanent ta bort serviceposten "{record.action_type}" 
                      och alla tillhörande dokument.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Avbryt</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Ta bort
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redigera service</DialogTitle>
            <DialogDescription>
              Uppdatera informationen för denna servicepost.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-action">Åtgärd *</Label>
                <Input
                  id="edit-action"
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-date">Datum *</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={performedDate}
                  onChange={(e) => setPerformedDate(e.target.value)}
                  required
                />
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-supplier">Leverantör</Label>
                <Input
                  id="edit-supplier"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cost">Kostnad (kr)</Label>
                <Input
                  id="edit-cost"
                  type="number"
                  step="0.01"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-category">Kategori</Label>
                <select
                  id="edit-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Välj kategori</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Anteckningar</Label>
              <Textarea
                id="edit-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Avbryt
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !actionType || !performedDate}>
                {isSaving ? 'Sparar...' : 'Spara'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
