import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { storageService } from "@/services/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Trash2, Download, Eye, History, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { DocumentUploadZone } from "@/components/documents/DocumentUploadZone";
import { DocumentPreviewDialog } from "@/components/documents/DocumentPreviewDialog";
import { ProtocolAnalysisDialog } from "@/components/component/ProtocolAnalysisDialog";
import { getErrorMessage } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type ComponentDocumentRow = Tables<"component_documents">;
type DocWithVersions = ComponentDocumentRow & { versions?: ComponentDocumentRow[]; signedUrl?: string | null };

interface ComponentDocumentsProps {
  componentId: string;
}

export function ComponentDocuments({ componentId }: ComponentDocumentsProps) {
  const { session } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocWithVersions | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [analysisDoc, setAnalysisDoc] = useState<{ id: string; name: string } | null>(null);


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

      await storageService.upload("component-documents", filePath, file);


      // Store the file path (not public URL) since bucket is now private
      // We'll generate signed URLs when accessing the file
      const storagePath = filePath;

      const { data: insertedDoc, error: dbError } = await supabase
        .from("component_documents")
        .insert([{
          component_id: componentId,
          name: file.name,
          file_url: storagePath,
          file_size: file.size,
          mime_type: file.type,
          version: nextVersion,
          is_latest: true,
        }])
        .select()
        .single();

      if (dbError) throw dbError;

      toast.success(nextVersion > 1 ? `Ny version (v${nextVersion}) uppladdad` : "Dokument uppladdat");
      refetch();

      // Check if this looks like a service protocol (PDF)
      const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const looksLikeProtocol = file.name.toLowerCase().includes('protokoll') || 
                                file.name.toLowerCase().includes('service') ||
                                file.name.toLowerCase().includes('besiktning') ||
                                file.name.toLowerCase().includes('rapport');

      if (isPDF && insertedDoc) {
        // Show analysis dialog
        setAnalysisDoc({ id: insertedDoc.id, name: file.name });
      }
    } catch (error: unknown) {
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
    
    try {
      return await storageService.createSignedUrl("component-documents", storagePath, 3600);
    } catch (error) {
      console.error("Error creating signed URL:", error);
      return null;
    }
  };

  const handleDownload = async (doc: ComponentDocumentRow) => {
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
      
      await storageService.remove("component-documents", [filePath]);


      const { error: dbError } = await supabase
        .from("component_documents")
        .delete()
        .eq("id", docId);

      if (dbError) throw dbError;

      toast.success("Dokument borttaget");
      refetch();
    } catch (error: unknown) {
      toast.error("Kunde inte ta bort dokument");
    }
  };

  const handlePreview = async (doc: ComponentDocumentRow) => {
    const versions = await getDocumentVersions(doc.name);
    // Get signed URL for preview
    const signedUrl = await getSignedUrl(doc.file_url);
    setSelectedDoc({ ...doc, versions, signedUrl });
    setPreviewOpen(true);
  };

  const isPdfDocument = (doc: ComponentDocumentRow) => {
    return doc.mime_type === 'application/pdf' || doc.name?.toLowerCase().endsWith('.pdf');
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
                    {isPdfDocument(doc) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setAnalysisDoc({ id: doc.id, name: doc.name })}
                        title="AI-analysera protokoll"
                        className="text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50"
                      >
                        <Sparkles className="h-4 w-4" />
                      </Button>
                    )}
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
          setSelectedDoc(version as unknown as DocWithVersions);
        }}

      />

      {analysisDoc && (
        <ProtocolAnalysisDialog
          open={!!analysisDoc}
          onOpenChange={(open) => !open && setAnalysisDoc(null)}
          documentId={analysisDoc.id}
          documentName={analysisDoc.name}
          componentId={componentId}
        />
      )}
    </div>
  );
}
