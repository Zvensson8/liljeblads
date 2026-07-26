import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CloudUpload, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentUploadZoneProps {
  onFileSelect: (file: File) => Promise<void>;
  uploading: boolean;
  accept?: string;
  maxSize?: number;
}

export function DocumentUploadZone({
  onFileSelect,
  uploading,
  accept,
  maxSize = 20 * 1024 * 1024, // 20MB default
}: DocumentUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    if (file.size > maxSize) {
      alert(`Filen är för stor. Max storlek är ${(maxSize / (1024 * 1024)).toFixed(0)} MB`);
      return;
    }
    await onFileSelect(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      await handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleFileSelect(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        "border-2 border-dashed rounded-lg p-8 transition-all duration-200",
        isDragging
          ? "border-primary bg-primary/5 scale-[1.02]"
          : "border-border hover:border-primary/50 hover:bg-accent/50",
        uploading && "opacity-50 pointer-events-none"
      )}
    >
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <div
          className={cn(
            "p-4 rounded-full transition-colors",
            isDragging ? "bg-primary/20" : "bg-muted"
          )}
        >
          <CloudUpload
            className={cn(
              "h-8 w-8",
              isDragging ? "text-primary" : "text-muted-foreground"
            )}
          />
        </div>

        <div>
          <p className="text-lg font-semibold mb-1">
            {isDragging ? "Släpp filen här" : "Dra & släpp fil här"}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            eller klicka för att välja fil
          </p>
          {maxSize && (
            <p className="text-xs text-muted-foreground">
              Max storlek: {(maxSize / (1024 * 1024)).toFixed(0)} MB
            </p>
          )}
        </div>

        <Button
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          variant={isDragging ? "default" : "outline"}
        >
          <Upload className="h-4 w-4 mr-2" />
          {uploading ? "Laddar upp..." : "Välj fil"}
        </Button>

        <Input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileInput}
          disabled={uploading}
          accept={accept}
        />
      </div>
    </div>
  );
}
