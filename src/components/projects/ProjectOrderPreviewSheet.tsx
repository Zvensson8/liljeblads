import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useGenerateProjectOrderText, useSendProjectOrderDraft } from "@/hooks/useEdgeFunctions";
import {
  Sheet,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Mail, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import type { Project } from "@/types/domain";

interface ProjectOrderPreviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Pick<Project, "id" | "name" | "project_number" | "budget"> | null;
}

export function ProjectOrderPreviewSheet({
  open,
  onOpenChange,
  project,
}: ProjectOrderPreviewSheetProps) {
  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  const generateProjectOrderText = useGenerateProjectOrderText();
  const sendProjectOrderDraft = useSendProjectOrderDraft();

  const handleGenerate = useCallback(async () => {
    if (!project?.id) return;
    setGenerating(true);
    setText("");
    try {
      const data = await generateProjectOrderText.mutateAsync({ projectId: project.id }) as { text?: string; error?: string };
      if (data?.error) throw new Error(data.error);
      setText(data?.text || "");
    } catch (err: any) {
      setText(`[Fel vid generering: ${err.message || "Okänt fel"}]\n\nDu kan skriva texten manuellt nedan.`);
    } finally {
      setGenerating(false);
    }
  }, [project?.id]);

  useEffect(() => {
    if (open && project?.id) {
      setText("");
      handleGenerate();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    setText("");
    onOpenChange(false);
  };

  const handleSend = async () => {
    if (!text.trim()) {
      toast.error("Skriv eller generera en text först");
      return;
    }

    setSending(true);
    try {
      if (!user?.email) throw new Error("Kunde inte hämta din e-post");

      const data = await sendProjectOrderDraft.mutateAsync({
        projectId: project.id,
        userEmail: user.email,
        customText: text,
      }) as { error?: string };
      if (data?.error) throw new Error(data.error);

      toast.success("Beställningsutkast skickat till din e-post");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Kunde inte skicka utkast");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) handleClose(); }}>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <SheetPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col gap-0 border-l bg-background p-0 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-lg">
          {/* Header */}
          <div className="flex-none border-b px-6 py-5">
            <SheetTitle className="text-lg font-semibold text-foreground">
              Förhandsgranskning av projektbeställning
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm text-muted-foreground">
              AI-genererad beställningstext för projektet. Redigera innan du skickar.
            </SheetDescription>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Summary badges */}
            <div className="flex flex-wrap gap-2">
              {project?.name && (
                <Badge variant="outline">{project.name}</Badge>
              )}
              {project?.project_number && (
                <Badge variant="secondary">{project.project_number}</Badge>
              )}
              {project?.budget && (
                <Badge variant="secondary">
                  {parseInt(project.budget).toLocaleString("sv-SE")} SEK
                </Badge>
              )}
            </div>

            {/* Generated text */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Beställningstext
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="h-7 text-xs"
                >
                  <RefreshCw className={`mr-1 h-3 w-3 ${generating ? "animate-spin" : ""}`} />
                  Regenerera
                </Button>
              </div>

              {generating && !text && (
                <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Genererar text...</span>
                </div>
              )}

              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={generating ? "Genererar..." : "Texten visas här..."}
                rows={18}
                className="text-sm leading-relaxed resize-none"
              />
            </div>

            {/* Email info */}
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              <Mail className="h-4 w-4 text-primary" />
              <span className="text-foreground">
                Utkastet skickas till <strong>din e-postadress</strong>
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex-none border-t px-6 py-4">
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Tillbaka
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || generating || !text.trim()}
              >
                {sending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-4 w-4" />
                )}
                {sending ? "Skickar..." : "Skicka till min e-post"}
              </Button>
            </div>
          </div>

          <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <span className="sr-only">Stäng</span>
          </SheetPrimitive.Close>
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </Sheet>
  );
}
