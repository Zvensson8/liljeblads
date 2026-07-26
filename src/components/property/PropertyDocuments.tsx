import { useState } from "react";
import { getErrorMessage } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { storageService } from "@/services/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Trash2, Download, Eye, History, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { DocumentUploadZone } from "@/components/documents/DocumentUploadZone";
import { DocumentPreviewDialog } from "@/components/documents/DocumentPreviewDialog";
import type { Tables } from "@/integrations/supabase/types";

type PropertyDocumentRow = Tables<"property_documents">;
type PropertyDocumentWithVersions = PropertyDocumentRow & { versions?: PropertyDocumentRow[] };

interface PropertyDocumentsProps {
  propertyId: string;
}

export function PropertyDocuments({ propertyId }: PropertyDocumentsProps) {
  const { session } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<PropertyDocumentWithVersions | null>(null);
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

  /** Which docs are already in the embeddings table (searchable by Jarvis chat). */
  const { data: indexedIds } = useQuery({
    queryKey: ["property-documents-indexed", propertyId, documents?.map((d) => d.id).join(",")],
    enabled: !!documents?.length,
    queryFn: async () => {
      const ids = (documents || []).map((d) => d.id);
      if (!ids.length) return new Set<string>();
      const { data, error } = await supabase
        .from("embeddings")
        .select("source_id")
        .eq("source_table", "property_documents")
        .in("source_id", ids);
      if (error) {
        console.warn("Could not load embedding status:", error.message);
        return new Set<string>();
      }
      return new Set((data || []).map((r) => r.source_id as string));
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

      await storageService.upload("property-documents", filePath, file);

      const publicUrl = storageService.getPublicUrl("property-documents", filePath);

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

      toast.success(
        nextVersion > 1
          ? `Ny version (v${nextVersion}) uppladdad — indexeras för AI-sök`
          : "Dokument uppladdat — indexeras för AI-sök (Jarvis)",
      );
      refetch();
    } catch (error: unknown) {
      toast.error("Kunde inte ladda upp dokument: " + getErrorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (docId: string, fileUrl: string) => {
    try {
      const filePath = fileUrl.split("/").slice(-3).join("/");

      await storageService.remove("property-documents", [filePath]);


      const { error: dbError } = await supabase
        .from("property_documents")
        .delete()
        .eq("id", docId);

      if (dbError) throw dbError;

      toast.success("Dokument borttaget");
      refetch();
    } catch (error: unknown) {
      toast.error("Kunde inte ta bort dokument");
    }
  };

  const handlePreview = async (doc: PropertyDocumentRow) => {
    const versions = await getDocumentVersions(doc.name);
    setSelectedDoc({ ...doc, versions });
    setPreviewOpen(true);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="border-dashed bg-muted/30">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Fastighetsmapp · AI-sökbar
          </CardTitle>
          <CardDescription className="text-xs">
            Ladda upp energideklarationer, protokoll och avtal. Textinnehåll indexeras
            automatiskt så Jarvis kan svara med källa i chatten.
          </CardDescription>
        </CardHeader>
      </Card>

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
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{doc.name}</p>
                        {doc.version && doc.version > 1 && (
                          <Badge variant="secondary" className="text-xs">
                            v{doc.version}
                          </Badge>
                        )}
                        {indexedIds?.has(doc.id) ? (
                          <Badge variant="outline" className="text-xs gap-1 border-primary/40 text-primary">
                            <Sparkles className="h-3 w-3" />
                            AI-indexerad
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Väntar index
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
          setSelectedDoc(version as PropertyDocumentRow);
        }}
      />
    </div>
  );
}
