import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mail, RefreshCw, Send } from "lucide-react";

export interface WorkOrderPreviewPanelProps {
  action?: string | null;
  contractor?: string | null;
  price?: number | string | null;
  quarter?: string | null;
  previewText: string;
  generating: boolean;
  sending: boolean;
  onPreviewTextChange: (value: string) => void;
  onRegenerate: () => void;
  onBack: () => void;
  onSend: () => void;
}

export function WorkOrderPreviewPanel({
  action,
  contractor,
  price,
  quarter,
  previewText,
  generating,
  sending,
  onPreviewTextChange,
  onRegenerate,
  onBack,
  onSend,
}: WorkOrderPreviewPanelProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {action && <Badge variant="outline">{action}</Badge>}
        {contractor && <Badge variant="secondary">{contractor}</Badge>}
        {price != null && price !== "" && (
          <Badge variant="secondary">
            {Number(price).toLocaleString("sv-SE")} SEK
          </Badge>
        )}
        {quarter && <Badge variant="secondary">{quarter}</Badge>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted-foreground uppercase">
            Beställningstext
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRegenerate}
            disabled={generating}
            className="h-7 text-xs"
          >
            <RefreshCw className={`mr-1 h-3 w-3 ${generating ? "animate-spin" : ""}`} />
            Regenerera
          </Button>
        </div>
        {generating && !previewText && (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Genererar text...</span>
          </div>
        )}
        <Textarea
          value={previewText}
          onChange={(e) => onPreviewTextChange(e.target.value)}
          placeholder={generating ? "Genererar..." : "Texten visas här..."}
          rows={18}
          className="text-sm leading-relaxed resize-none"
        />
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
        <Mail className="h-4 w-4 text-primary" />
        <span className="text-foreground">
          Utkastet skickas till <strong>din e-postadress</strong>
        </span>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onBack}>
          Tillbaka
        </Button>
        <Button
          onClick={onSend}
          disabled={sending || generating || !previewText.trim()}
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
  );
}
