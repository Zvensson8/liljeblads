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

interface ComponentDocumentsProps {
  componentId: string;
}

export function ComponentDocuments({ componentId }: ComponentDocumentsProps) {
  const { session } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: documents, refetch } = useQuery({
    queryKey: ["component-documents", componentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("component_documents")
        .select("*")
        .eq("component_id", componentId)
        .eq("is_latest", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const getDocumentVersions = async (docName: string) => {
    const { data, error } = await supabase
      .from("component_documents")
      .select("*")
      .eq("component_id", componentId)
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
      // Check if file with same name exists
      const existingDocs = await getDocumentVersions(file.name);
      const nextVersion = existingDocs.length > 0 ? Math.max(...existingDocs.map(d => d.version || 1)) + 1 : 1;

      const fileExt = file.name.split(".").pop();
      const filePath = `${session.user.id}/${componentId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("component-documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Store the file path (not public URL) since bucket is now private
      // We'll generate signed URLs when accessing the file
      const storagePath = filePath;

      const { error: dbError } = await supabase
        .from("component_documents")
        .insert([{
          component_id: componentId,
          name: file.name,
          file_url: storagePath,
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

  // Get signed URL for accessing private storage
  const getSignedUrl = async (storagePath: string): Promise<string | null> => {
    // Handle legacy public URLs that contain the full supabase URL
    if (storagePath.includes('supabase.co')) {
      // Extract the path from the URL
      const urlParts = storagePath.split('/storage/v1/object/public/component-documents/');
      if (urlParts.length > 1) {
        storagePath = urlParts[1];
      }
    }
    
    const { data, error } = await supabase.storage
      .from("component-documents")
      .createSignedUrl(storagePath, 3600); // 1 hour expiry
    
    if (error) {
      console.error("Error creating signed URL:", error);
      return null;
    }
    return data.signedUrl;
  };

  const handleDownload = async (doc: any) => {
    const signedUrl = await getSignedUrl(doc.file_url);
    if (signedUrl) {
      window.open(signedUrl, "_blank");
    } else {
      toast.error("Kunde inte hämta dokument");
    }
  };

  const handleDeleteDocument = async (docId: string, fileUrl: string) => {
    try {
      // Handle both legacy full URLs and new storage paths
      let filePath = fileUrl;
      if (fileUrl.includes('supabase.co')) {
        const urlParts = fileUrl.split('/storage/v1/object/public/component-documents/');
        if (urlParts.length > 1) {
          filePath = urlParts[1];
        }
      }
      
      const { error: storageError } = await supabase.storage
        .from("component-documents")
        .remove([filePath]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from("component_documents")
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
    // Get signed URL for preview
    const signedUrl = await getSignedUrl(doc.file_url);
    setSelectedDoc({ ...doc, versions, signedUrl });
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
                          const signedUrl = await getSignedUrl(doc.file_url);
                          setSelectedDoc({ ...doc, versions, signedUrl });
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
                      onClick={() => handleDownload(doc)}
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
