import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, ExternalLink, History, X } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { useState } from "react";

interface Document {
  id: string;
  name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
  version?: number;
  is_latest?: boolean;
  signedUrl?: string; // Optional signed URL for private storage access
}

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: (Document & { signedUrl?: string }) | null;
  versions?: Document[];
  onVersionSelect?: (version: Document) => void;
}

export function DocumentPreviewDialog({
  open,
  onOpenChange,
  document,
  versions = [],
  onVersionSelect,
}: DocumentPreviewDialogProps) {
  const [showVersions, setShowVersions] = useState(false);

  if (!document) return null;

  // Use signed URL if available, otherwise fall back to file_url (for legacy public URLs)
  const accessUrl = document.signedUrl || document.file_url;

  const isImage = document.mime_type?.startsWith("image/");
  const isPdf = document.mime_type === "application/pdf";
  const isPreviewable = isImage || isPdf;

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "-";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="truncate">{document.name}</DialogTitle>
              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                <span>{formatFileSize(document.file_size)}</span>
                <span>•</span>
                <span>{format(new Date(document.created_at), "PPP", { locale: sv })}</span>
                {document.version && (
                  <>
                    <span>•</span>
                    <Badge variant={document.is_latest ? "default" : "secondary"}>
                      Version {document.version}
                    </Badge>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {versions.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowVersions(!showVersions)}
                >
                  <History className="h-4 w-4 mr-2" />
                  {versions.length} versioner
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(accessUrl, "_blank")}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Öppna
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const a = window.document.createElement("a");
                  a.href = accessUrl;
                  a.download = document.name;
                  a.click();
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                Ladda ner
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {showVersions ? (
            <div className="space-y-2 overflow-y-auto max-h-[60vh] p-4">
              <h3 className="font-semibold mb-4">Tidigare versioner</h3>
              {versions.map((version) => (
                <div
                  key={version.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    onVersionSelect?.(version);
                    setShowVersions(false);
                  }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Version {version.version}</span>
                      {version.is_latest && (
                        <Badge variant="default" className="text-xs">
                          Senaste
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(version.created_at), "PPpp", { locale: sv })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatFileSize(version.file_size)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(version.file_url, "_blank");
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : isImage ? (
            <div className="h-full overflow-auto bg-muted/30 rounded-lg flex items-center justify-center">
              <img
                src={accessUrl}
                alt={document.name}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : isPdf ? (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
              <div className="p-4 bg-muted rounded-full">
                <ExternalLink className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium mb-2">PDF-förhandsvisning</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Öppna PDF-filen i en ny flik för att visa den
                </p>
                <Button
                  onClick={() => window.open(accessUrl, "_blank")}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Öppna PDF
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
              <div className="p-4 bg-muted rounded-full">
                <ExternalLink className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium mb-2">Förhandsvisning inte tillgänglig</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Denna filtyp kan inte förhandsvisas i webbläsaren
                </p>
                <Button
                  onClick={() => window.open(accessUrl, "_blank")}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Öppna i ny flik
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
