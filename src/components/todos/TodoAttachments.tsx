import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { storageService } from "@/services/supabase";
import { Button } from "@/components/ui/button";
import { Download, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { AttachmentIcon } from "./AttachmentIcon";
import { getErrorMessage } from "@/lib/utils";

interface TodoAttachmentRow {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
}

interface TodoAttachmentsProps {
  todoId: string;
  onUpdate?: () => void;
}

export function TodoAttachments({ todoId, onUpdate }: TodoAttachmentsProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const { data: attachments, refetch } = useQuery<TodoAttachmentRow[]>({
    queryKey: ["todo-attachments", todoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("todo_attachments" as never)
        .select("*")
        .eq("todo_id", todoId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as TodoAttachmentRow[];
    },
  });

  const handleFileSelect = async (file: File) => {
    if (file.size > 10485760) {
      toast.error("Filen är för stor. Max 10MB per fil.");
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${todoId}/${fileName}`;

      await storageService.upload('todo-attachments', filePath, file);

      const { error: dbError } = await supabase
        .from('todo_attachments' as never)
        .insert({
          todo_id: todoId,
          file_name: file.name,
          file_url: filePath,
          file_size: file.size,
          mime_type: file.type,
        } as never);

      if (dbError) throw dbError;

      toast.success("Bilaga uppladdad");
      refetch();
      onUpdate?.();
    } catch (error: unknown) {
      toast.error("Kunde inte ladda upp bilaga: " + getErrorMessage(error));
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (attachment: TodoAttachmentRow) => {
    try {
      const data = await storageService.download('todo-attachments', attachment.file_url);
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Kunde inte ladda ner bilaga");
    }
  };

  const handleDelete = async (attachment: TodoAttachmentRow) => {
    try {
      await storageService.remove('todo-attachments', [attachment.file_url]);

      const { error: dbError } = await supabase
        .from('todo_attachments' as never)
        .delete()
        .eq('id', attachment.id);

      if (dbError) throw dbError;

      toast.success("Bilaga borttagen");
      refetch();
      onUpdate?.();
    } catch (error) {
      toast.error("Kunde inte ta bort bilaga");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border"
        } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-2">
          {uploading ? "Laddar upp..." : "Släpp filer här eller klicka för att välja"}
        </p>
        <p className="text-xs text-muted-foreground mb-4">Max 10MB per fil</p>
        <input
          type="file"
          onChange={handleFileInput}
          disabled={uploading}
          className="hidden"
          id="file-upload"
        />
        <Button asChild variant="outline" size="sm" disabled={uploading}>
          <label htmlFor="file-upload" className="cursor-pointer">
            Välj fil
          </label>
        </Button>
      </div>

      {attachments && attachments.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Bifogade filer ({attachments.length})</h4>
          {attachments.map((attachment: any) => (
            <div
              key={attachment.id}
              className="flex items-center gap-3 p-3 rounded-lg border bg-card"
            >
              <AttachmentIcon 
                mimeType={attachment.mime_type || ""} 
                fileName={attachment.file_name}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{attachment.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(attachment.file_size || 0)}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleDownload(attachment)}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleDelete(attachment)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
