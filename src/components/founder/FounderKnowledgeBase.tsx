import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { storageService } from "@/services/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { BookOpen, Upload, Trash2, Loader2, FileText, FileUp, Check } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";

interface KBSource {
  source_key: string;
  source_title: string;
  chunk_count: number;
  total_tokens: number;
  created_at: string;
}

export function FounderKnowledgeBase() {
  const { session } = useAuth();
  const [sources, setSources] = useState<KBSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Text form state
  const [sourceKey, setSourceKey] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [content, setContent] = useState("");

  // File upload state
  const [fileSourceKey, setFileSourceKey] = useState("");
  const [fileSourceTitle, setFileSourceTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [uploadStep, setUploadStep] = useState(0); // 0=idle, 1=uploading, 2=parsing, 3=ingesting, 4=done
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSources = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("knowledge_base_chunks")
        .select("source_key, source_title, chunk_index, token_count, created_at");

      if (error) throw error;

      const grouped: Record<string, KBSource> = {};
      (data || []).forEach((row: { source_key: string; source_title: string; chunk_index: number; token_count: number | null; created_at: string }) => {
        if (!grouped[row.source_key]) {
          grouped[row.source_key] = {
            source_key: row.source_key,
            source_title: row.source_title,
            chunk_count: 0,
            total_tokens: 0,
            created_at: row.created_at,
          };
        }
        grouped[row.source_key].chunk_count++;
        grouped[row.source_key].total_tokens += row.token_count || 0;
      });

      setSources(Object.values(grouped).sort((a, b) => a.source_title.localeCompare(b.source_title)));
    } catch (err: unknown) {
      console.error("Error fetching KB sources:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const callAuthedFunction = useCallback(async (functionName: string, payload: Record<string, unknown>) => {
    const accessToken = session?.access_token;
    if (!accessToken) {
      throw new Error("Din session har gått ut. Logga in igen och försök på nytt.");
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result?.error || `Edge Function misslyckades (${response.status})`);
    }

    return result;
  }, [session?.access_token]);

  const handleIngestText = async () => {
    if (!sourceKey.trim() || !sourceTitle.trim() || !content.trim()) {
      toast.error("Fyll i alla fält");
      return;
    }

    setIngesting(true);
    try {
      const data = await callAuthedFunction("ingest-knowledge-base", {
        sourceKey: sourceKey.trim(),
        sourceTitle: sourceTitle.trim(),
        content: content.trim(),
      });

      if (data?.error) throw new Error(data.error);

      toast.success(`Ingestat ${data.chunksCreated || 0} chunks från "${sourceTitle}"`);
      setSourceKey("");
      setSourceTitle("");
      setContent("");
      fetchSources();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Kunde inte ingesta dokumentet");
    } finally {
      setIngesting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      "application/pdf",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const allowedExts = [".pdf", ".txt", ".docx", ".md"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();

    if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
      toast.error("Stöder PDF, DOCX, TXT och MD-filer");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("Max filstorlek: 20 MB");
      return;
    }

    setSelectedFile(file);

    // Auto-fill title from filename
    if (!fileSourceTitle) {
      const name = file.name.replace(/\.[^/.]+$/, "");
      setFileSourceTitle(name);
    }
    if (!fileSourceKey) {
      const key = file.name
        .replace(/\.[^/.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9åäö]+/g, "-")
        .replace(/^-|-$/g, "");
      setFileSourceKey(key);
    }
  };

  const readFileAsText = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const handleFileUpload = async () => {
    if (!selectedFile || !fileSourceKey.trim() || !fileSourceTitle.trim()) {
      toast.error("Välj en fil och fyll i nyckel och titel");
      return;
    }

    setIngesting(true);
    setUploadStep(1);
    setUploadProgress("Läser fil...");

    try {
      let extractedText = "";
      const ext = "." + selectedFile.name.split(".").pop()?.toLowerCase();

      if (ext === ".txt" || ext === ".md") {
        // Plain text - read directly
        extractedText = await readFileAsText(selectedFile);
        setUploadStep(2);
        setUploadProgress("Text extraherad");
      } else {
        // PDF/DOCX - upload to storage, then parse
        setUploadProgress("Laddar upp fil...");

        const filePath = `knowledge-base/${Date.now()}-${selectedFile.name}`;
        try {
          await storageService.upload("property-documents", filePath, selectedFile);
        } catch (uploadError: unknown) {
          throw new Error("Uppladdning misslyckades: " + uploadError.message);
        }

        setUploadStep(2);
        setUploadProgress("Extraherar text från dokument...");

        // Get signed URL for the uploaded file
        const signedUrl = await storageService.createSignedUrl("property-documents", filePath, 300);
        if (!signedUrl) throw new Error("Kunde inte skapa signerad URL");

        // Parse the document - call multiple times with increasing page ranges for large docs
        const parseData = await callAuthedFunction("parse-document", {
          url: signedUrl,
          maxPages: 100,
        });

        if (parseData?.error && !parseData?.text) throw new Error(parseData.error);

        extractedText = parseData?.text || "";

        // Clean up the temp file
        await storageService.remove("property-documents", [filePath]);

        if (!extractedText.trim()) {
          throw new Error("Kunde inte extrahera text från dokumentet. Försök med en textfil istället.");
        }
      }

      setUploadStep(3);
      setUploadProgress(`Ingestar ${extractedText.length.toLocaleString("sv-SE")} tecken i kunskapsbasen...`);

      // Ingest the extracted text
      const data = await callAuthedFunction("ingest-knowledge-base", {
        sourceKey: fileSourceKey.trim(),
        sourceTitle: fileSourceTitle.trim(),
        content: extractedText,
      });

      if (data?.error) throw new Error(data.error);

      setUploadStep(4);
      setUploadProgress(`Klart! ${data.chunksCreated || 0} chunks skapade.`);
      toast.success(`Ingestat ${data.chunksCreated || 0} chunks från "${fileSourceTitle}"`);

      // Reset after delay
      setTimeout(() => {
        setSelectedFile(null);
        setFileSourceKey("");
        setFileSourceTitle("");
        setUploadStep(0);
        setUploadProgress("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }, 2000);

      fetchSources();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Kunde inte bearbeta dokumentet");
      setUploadStep(0);
      setUploadProgress("");
    } finally {
      setIngesting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteKey) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("knowledge_base_chunks")
        .delete()
        .eq("source_key", deleteKey);

      if (error) throw error;
      toast.success("Källa borttagen");
      setDeleteKey(null);
      fetchSources();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Kunde inte ta bort");
    } finally {
      setDeleting(false);
    }
  };

  const stepProgress = uploadStep === 0 ? 0 : uploadStep === 1 ? 20 : uploadStep === 2 ? 50 : uploadStep === 3 ? 80 : 100;

  return (
    <div className="space-y-6">
      {/* Upload card with tabs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Ladda upp till kunskapsbasen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="file" className="space-y-4">
            <TabsList>
              <TabsTrigger value="file">
                <FileUp className="h-4 w-4 mr-1.5" />
                Ladda upp fil
              </TabsTrigger>
              <TabsTrigger value="text">
                <FileText className="h-4 w-4 mr-1.5" />
                Klistra in text
              </TabsTrigger>
            </TabsList>

            {/* File upload tab */}
            <TabsContent value="file" className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,.docx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {selectedFile ? (
                  <div className="space-y-2">
                    <FileText className="h-10 w-10 mx-auto text-primary" />
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(0)} KB · Klicka för att byta fil
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <FileUp className="h-10 w-10 mx-auto text-muted-foreground" />
                    <p className="font-medium">Klicka för att välja fil</p>
                    <p className="text-xs text-muted-foreground">PDF, DOCX, TXT eller MD (max 20 MB)</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Käll-nyckel</label>
                  <Input
                    placeholder="t.ex. abt06"
                    value={fileSourceKey}
                    onChange={(e) => setFileSourceKey(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Titel</label>
                  <Input
                    placeholder="t.ex. ABT 06 – Allmänna bestämmelser"
                    value={fileSourceTitle}
                    onChange={(e) => setFileSourceTitle(e.target.value)}
                  />
                </div>
              </div>

              {uploadStep > 0 && (
                <div className="space-y-2">
                  <Progress value={stepProgress} className="h-2" />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {uploadStep < 4 ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                    {uploadProgress}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={handleFileUpload}
                  disabled={ingesting || !selectedFile}
                >
                  {ingesting ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Bearbetar...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-1.5 h-4 w-4" />
                      Ladda upp & ingesta
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            {/* Text paste tab */}
            <TabsContent value="text" className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Käll-nyckel</label>
                  <Input
                    placeholder="t.ex. abt06"
                    value={sourceKey}
                    onChange={(e) => setSourceKey(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Titel</label>
                  <Input
                    placeholder="t.ex. ABT 06 – Allmänna bestämmelser"
                    value={sourceTitle}
                    onChange={(e) => setSourceTitle(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Innehåll</label>
                <Textarea
                  placeholder="Klistra in texten här..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={12}
                  className="text-sm"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {content.length > 0 ? `${content.length.toLocaleString("sv-SE")} tecken` : ""}
                </span>
                <Button onClick={handleIngestText} disabled={ingesting}>
                  {ingesting ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Bearbetar...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-1.5 h-4 w-4" />
                      Ingesta text
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Existing sources */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Befintliga kunskapskällor
            <Badge variant="secondary" className="ml-auto">{sources.length} källor</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sources.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>Inga kunskapskällor ännu</p>
              <p className="text-xs mt-1">Ladda upp ABT06 eller andra branschstandarder ovan</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sources.map((src) => (
                <div
                  key={src.source_key}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-sm">{src.source_title}</p>
                      <p className="text-xs text-muted-foreground">
                        {src.chunk_count} chunks · ~{src.total_tokens.toLocaleString("sv-SE")} tokens · nyckel: {src.source_key}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteKey(src.source_key)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteKey} onOpenChange={(open) => !open && setDeleteKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort kunskapskälla?</AlertDialogTitle>
            <AlertDialogDescription>
              Alla chunks för denna källa tas bort permanent. Detta kan inte ångras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Tar bort..." : "Ta bort"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
