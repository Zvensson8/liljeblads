import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, FileText, Trash2, Download, CloudUpload } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface PropertyDocumentsProps {
  propertyId: string;
}

export function PropertyDocuments({ propertyId }: PropertyDocumentsProps) {
  const { session } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: documents, refetch } = useQuery({
    queryKey: ["property-documents", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_documents")
        .select("*")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const uploadFile = async (file: File) => {
    if (!session?.user) return;

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${session.user.id}/${propertyId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("property-documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("property-documents")
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from("property_documents")
        .insert([{
          property_id: propertyId,
          name: file.name,
          file_url: publicUrl,
          file_size: file.size,
          mime_type: file.type,
        }]);

      if (dbError) throw dbError;

      toast.success("Dokument uppladdat");
      refetch();
    } catch (error: any) {
      toast.error("Kunde inte ladda upp dokument: " + error.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      await uploadFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDeleteDocument = async (docId: string, fileUrl: string) => {
    try {
      const filePath = fileUrl.split("/").slice(-3).join("/");
      
      const { error: storageError } = await supabase.storage
        .from("property-documents")
        .remove([filePath]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from("property_documents")
        .delete()
        .eq("id", docId);

      if (dbError) throw dbError;

      toast.success("Dokument borttaget");
      refetch();
    } catch (error: any) {
      toast.error("Kunde inte ta bort dokument");
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Drag & Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 transition-all duration-200",
          isDragging 
            ? "border-primary bg-primary/5 scale-[1.02]" 
            : "border-border hover:border-primary/50 hover:bg-accent/50",
          uploading && "opacity-50 pointer-events-none"
        )}
      >
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <div className={cn(
            "p-4 rounded-full transition-colors",
            isDragging ? "bg-primary/20" : "bg-muted"
          )}>
            <CloudUpload className={cn(
              "h-8 w-8",
              isDragging ? "text-primary" : "text-muted-foreground"
            )} />
          </div>
          
          <div>
            <p className="text-lg font-semibold mb-1">
              {isDragging ? "Släpp filen här" : "Dra & släpp fil här"}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              eller klicka för att välja fil
            </p>
          </div>

          <Button 
            disabled={uploading} 
            onClick={() => fileInputRef.current?.click()}
            variant={isDragging ? "default" : "outline"}
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? "Laddar upp..." : "Välj fil"}
          </Button>
          
          <Input
            ref={fileInputRef}
            id="doc-upload"
            type="file"
            className="hidden"
            onChange={handleFileUpload}
            disabled={uploading}
          />
        </div>
      </div>

      <div className="space-y-2">
        {documents && documents.length > 0 ? (
          documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{doc.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : ""}
                        {" · "}
                        {format(new Date(doc.created_at), "yyyy-MM-dd HH:mm", { locale: sv })}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(doc.file_url, "_blank")}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteDocument(doc.id, doc.file_url)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            Inga dokument uppladdade än
          </div>
        )}
      </div>
    </div>
  );
}
