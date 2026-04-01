import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface WorkOrderPreviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrder: any;
}

export function WorkOrderPreviewSheet({
  open,
  onOpenChange,
  workOrder,
}: WorkOrderPreviewSheetProps) {
  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-order-text", {
        body: { workOrderId: workOrder.id },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setText(data.text || "");
      toast.success("Text genererad");
    } catch (err: any) {
      toast.error(err.message || "Kunde inte generera text");
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!text.trim()) {
      toast.error("Skriv eller generera en text först");
      return;
    }

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("Kunde inte hämta din e-post");

      const { data, error } = await supabase.functions.invoke("send-work-order-draft", {
        body: {
          workOrderId: workOrder.id,
          userEmail: user.email,
          customText: text,
        },
      });

      if (error) throw error;
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>Beställningsutkast</SheetTitle>
          <SheetDescription>
            Generera en beställningstext med AI eller skriv din egen. Du kan redigera texten innan du skickar.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-4 mt-4 min-h-0">
          <Button
            variant="outline"
            onClick={handleGenerate}
            disabled={generating}
            className="w-full"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {generating ? "Genererar..." : "Generera med AI"}
          </Button>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Klicka 'Generera med AI' eller skriv din beställningstext här..."
            className="flex-1 min-h-[300px] resize-none"
          />

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Avbryt
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending || !text.trim()}
              className="flex-1"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              {sending ? "Skickar..." : "Skicka till min e-post"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
