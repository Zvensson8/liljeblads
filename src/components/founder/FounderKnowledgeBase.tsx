import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { BookOpen, Upload, Trash2, Loader2, FileText, Search } from "lucide-react";
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

interface KBSource {
  source_key: string;
  source_title: string;
  chunk_count: number;
  total_tokens: number;
  created_at: string;
}

export function FounderKnowledgeBase() {
  const [sources, setSources] = useState<KBSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [sourceKey, setSourceKey] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [content, setContent] = useState("");

  const fetchSources = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("knowledge_base_chunks")
        .select("source_key, source_title, chunk_index, token_count, created_at");

      if (error) throw error;

      // Group by source_key
      const grouped: Record<string, KBSource> = {};
      (data || []).forEach((row: any) => {
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
    } catch (err: any) {
      console.error("Error fetching KB sources:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleIngest = async () => {
    if (!sourceKey.trim() || !sourceTitle.trim() || !content.trim()) {
      toast.error("Fyll i alla fält");
      return;
    }

    setIngesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ingest-knowledge-base", {
        body: {
          sourceKey: sourceKey.trim(),
          sourceTitle: sourceTitle.trim(),
          content: content.trim(),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Ingestat ${data.chunksCreated || 0} chunks från "${sourceTitle}"`);
      setSourceKey("");
      setSourceTitle("");
      setContent("");
      fetchSources();
    } catch (err: any) {
      toast.error(err.message || "Kunde inte ingesta dokumentet");
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
    } catch (err: any) {
      toast.error(err.message || "Kunde inte ta bort");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Ingest form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Ladda upp kunskapsbastext
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <Button onClick={handleIngest} disabled={ingesting}>
              {ingesting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Bearbetar...
                </>
              ) : (
                <>
                  <Upload className="mr-1.5 h-4 w-4" />
                  Ingesta dokument
                </>
              )}
            </Button>
          </div>
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
