import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Trash2, Download, Eye, History } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { DocumentUploadZone } from "@/components/documents/DocumentUploadZone";
import { DocumentPreviewDialog } from "@/components/documents/DocumentPreviewDialog";

interface PropertyDocumentsProps {
  propertyId: string;
}

export function PropertyDocuments({ propertyId }: PropertyDocumentsProps) {
  const { session } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: documents, refetch } = useQuery({
    queryKey: ["property-documents", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_documents")
        .select("*")
        .eq("property_id", propertyId)
        .eq("is_latest", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const getDocumentVersions = async (docName: string) => {
    const { data, error } = await supabase
      .from("property_documents")
      .select("*")
      .eq("property_id", propertyId)
      .eq("name", docName)
      .order("version", { ascending: false });

    if (error) {
      console.error("Error fetching versions:", error);
      return [];
    }
    return data || [];
  };

  const uploadFile = async (file: File) => {
    if (!session?.user) return;

    setUploading(true);
    try {
      const existingDocs = await getDocumentVersions(file.name);
      const nextVersion = existingDocs.length > 0 ? Math.max(...existingDocs.map(d => d.version || 1)) + 1 : 1;

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
          version: nextVersion,
          is_latest: true,
        }]);

      if (dbError) throw dbError;

      toast.success(nextVersion > 1 ? `Ny version (v${nextVersion}) uppladdad` : "Dokument uppladdat");
      refetch();
    } catch (error: any) {
      toast.error("Kunde inte ladda upp dokument: " + error.message);
    } finally {
      setUploading(false);
    }
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

  const handlePreview = async (doc: any) => {
    const versions = await getDocumentVersions(doc.name);
    setSelectedDoc({ ...doc, versions });
    setPreviewOpen(true);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <DocumentUploadZone onFileSelect={uploadFile} uploading={uploading} />

      <div className="space-y-2">
        {documents && documents.length > 0 ? (
          documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{doc.name}</p>
                        {doc.version && doc.version > 1 && (
                          <Badge variant="secondary" className="text-xs">
                            v{doc.version}
                          </Badge>
                        )}
                      </div>
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
                      onClick={() => handlePreview(doc)}
                      title="Förhandsgranska"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async () => {
                        const versions = await getDocumentVersions(doc.name);
                        if (versions.length > 1) {
                          setSelectedDoc({ ...doc, versions });
                          setPreviewOpen(true);
                        } else {
                          toast.info("Endast en version finns");
                        }
                      }}
                      title="Versionshistorik"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(doc.file_url, "_blank")}
                      title="Ladda ner"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteDocument(doc.id, doc.file_url)}
                      title="Ta bort"
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

      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        document={selectedDoc}
        versions={selectedDoc?.versions || []}
        onVersionSelect={(version) => {
          setSelectedDoc(version);
        }}
      />
    </div>
  );
}
