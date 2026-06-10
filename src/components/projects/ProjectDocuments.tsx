import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { storageService } from "@/services/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useLogProjectActivity } from "@/hooks/useProjectActivityLog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Upload, File, Trash2, Download, Loader2, FolderOpen, Eye, History } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { DocumentPreviewDialog } from "@/components/documents/DocumentPreviewDialog";
import { DocumentUploadZone } from "@/components/documents/DocumentUploadZone";

interface ProjectDocumentsProps {
  projectId: string;
  onDocumentUpload?: () => void;
}

interface Document {
  id: string;
  name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  folder: string | null;
  created_at: string;
  version?: number;
  is_latest?: boolean;
}

const FOLDERS = [
  "Allmänt",
  "Avtal",
  "Ritningar",
  "Protokoll",
  "Fakturor",
  "Kommunikation",
];

export function ProjectDocuments({ projectId, onDocumentUpload }: ProjectDocumentsProps) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const logActivity = useLogProjectActivity();
  const [loading, setLoading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState("Allmänt");
  const [uploading, setUploading] = useState(false);
  const [filterFolder, setFilterFolder] = useState<string>("all");
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Get signed URL for accessing private storage
  const getSignedUrl = async (storagePath: string): Promise<string | null> => {
    // Handle legacy public URLs that contain the full supabase URL
    if (storagePath.includes('supabase.co')) {
      // For legacy public URLs, return as-is
      return storagePath;
    }
    
    try {
      return await storageService.createSignedUrl("project-documents", storagePath, 3600);
    } catch (error) {
      console.error("Error creating signed URL:", error);
      return null;
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [projectId]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("project_documents")
        .select("*")
        .eq("project_id", projectId)
        .eq("is_latest", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: unknown) {
      toast.error("Kunde inte hämta dokument");
    } finally {
      setLoading(false);
    }
  };

  const getDocumentVersions = async (docName: string) => {
    const { data, error } = await supabase
      .from("project_documents")
      .select("*")
      .eq("project_id", projectId)
      .eq("name", docName)
      .order("version", { ascending: false });

    if (error) {
      console.error("Error fetching versions:", error);
      return [];
    }
    return data || [];
  };

const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const existingDocs = await getDocumentVersions(file.name);
      const nextVersion = existingDocs.length > 0 ? Math.max(...existingDocs.map(d => d.version || 1)) + 1 : 1;

      if (!user) throw new Error("Not authenticated");

      const fileExt = file.name.split(".").pop();
      // Use path structure: userId/projectId/timestamp.ext for RLS to work
      const filePath = `${user.id}/${projectId}/${Date.now()}.${fileExt}`;

      await storageService.upload("project-documents", filePath, file);


      // Store the file path (not public URL) since bucket is now private
      // We'll generate signed URLs when accessing the file
      const { error: dbError } = await supabase
        .from("project_documents")
        .insert({
          project_id: projectId,
          name: file.name,
          file_url: filePath,
          file_size: file.size,
          mime_type: file.type,
          folder: selectedFolder,
          version: nextVersion,
          is_latest: true,
        });

      if (dbError) throw dbError;

      // Log activity
      await logActivity.mutateAsync({
        project_id: projectId,
        activity_type: "document_upload",
        description: `Dokument uppladdad: "${file.name}" i mappen "${selectedFolder}"${nextVersion > 1 ? ` (version ${nextVersion})` : ""}`,
      });

      toast.success(nextVersion > 1 ? `Ny version (v${nextVersion}) uppladdad` : "Dokument uppladdat");
      setUploadDialogOpen(false);
      fetchDocuments();
      
      if (onDocumentUpload) {
        onDocumentUpload();
      }
    } catch (error: unknown) {
      console.error("Upload error:", error);
      toast.error(`Kunde inte ladda upp dokument: ${getErrorMessage(error)}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: Document) => {
    if (!confirm("Är du säker på att du vill ta bort detta dokument?")) return;

    try {
      const { error } = await supabase
        .from("project_documents")
        .delete()
        .eq("id", doc.id);

      if (error) throw error;

      toast.success("Dokument borttaget");
      fetchDocuments();
    } catch (error: unknown) {
      toast.error("Kunde inte ta bort dokument");
    }
  };

const handlePreview = async (doc: Document) => {
    const versions = await getDocumentVersions(doc.name);
    // Get signed URL for preview
    const signedUrl = await getSignedUrl(doc.file_url);
    setSelectedDoc({ ...doc, versions, signedUrl });
    setPreviewOpen(true);
  };

  const handleDownload = async (doc: Document) => {
    const signedUrl = await getSignedUrl(doc.file_url);
    if (signedUrl) {
      window.open(signedUrl, "_blank");
    } else {
      toast.error("Kunde inte hämta dokument");
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "-";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const filteredDocuments = filterFolder === "all"
    ? documents
    : documents.filter((doc) => doc.folder === filterFolder);

  const documentsByFolder = FOLDERS.map((folder) => ({
    folder,
    count: documents.filter((doc) => doc.folder === folder).length,
  }));

  return (
    <div className="space-y-6">
      {/* Folder overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {documentsByFolder.map(({ folder, count }) => (
          <div
            key={folder}
            className="border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => setFilterFolder(folder)}
          >
            <FolderOpen className="h-8 w-8 text-primary mb-2" />
            <p className="font-medium text-sm">{folder}</p>
            <p className="text-xs text-muted-foreground">{count} filer</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        <Select value={filterFolder} onValueChange={setFilterFolder}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Välj mapp" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla mappar</SelectItem>
            {FOLDERS.map((folder) => (
              <SelectItem key={folder} value={folder}>
                {folder}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={() => setUploadDialogOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Ladda upp dokument
        </Button>
      </div>

      {/* Documents table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <File className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg mb-2">Inga dokument hittades</p>
          <p className="text-sm">Ladda upp ditt första dokument för att komma igång</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Namn</TableHead>
                <TableHead>Mapp</TableHead>
                <TableHead>Storlek</TableHead>
                <TableHead>Uppladdad</TableHead>
                <TableHead className="text-right">Åtgärder</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocuments.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <File className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{doc.name}</span>
                      {doc.version && doc.version > 1 && (
                        <Badge variant="secondary" className="text-xs ml-2">
                          v{doc.version}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{doc.folder || "Allmänt"}</TableCell>
                  <TableCell>{formatFileSize(doc.file_size)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(doc.created_at), "PPP", { locale: sv })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreview(doc)}
                        title="Förhandsgranska"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
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
                        size="sm"
                        onClick={() => handleDownload(doc)}
                        title="Ladda ner"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(doc)}
                        title="Ta bort"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ladda upp dokument</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Välj mapp</label>
              <Select value={selectedFolder} onValueChange={setSelectedFolder}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLDERS.map((folder) => (
                    <SelectItem key={folder} value={folder}>
                      {folder}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Välj fil</label>
              <DocumentUploadZone onFileSelect={uploadFile} uploading={uploading} />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUploadDialogOpen(false)}
              disabled={uploading}
            >
              Avbryt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
