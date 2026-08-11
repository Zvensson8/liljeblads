import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CloudUpload, FolderOpen, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { INGEST_ACCEPT, INGEST_MAX_FILE_BYTES } from '@/lib/zipDocumentIngest';

interface DocumentUploadZoneProps {
  /** Single file (legacy) or multi */
  onFileSelect?: (file: File) => Promise<void>;
  /** Preferred: multi-file / zip / folder */
  onFilesSelect?: (files: File[]) => Promise<void>;
  uploading: boolean;
  accept?: string;
  maxSize?: number;
  /** Show folder picker (webkitdirectory) */
  allowFolder?: boolean;
  /** Progress text while batching */
  progressText?: string | null;
}

export function DocumentUploadZone({
  onFileSelect,
  onFilesSelect,
  uploading,
  accept = INGEST_ACCEPT,
  maxSize = INGEST_MAX_FILE_BYTES,
  allowFolder = true,
  progressText,
}: DocumentUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = folderInputRef.current;
    if (!el) return;
    el.setAttribute('webkitdirectory', '');
    el.setAttribute('directory', '');
  }, []);

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;

    for (const f of files) {
      if (f.size > maxSize && !f.name.toLowerCase().endsWith('.zip')) {
        alert(
          `Filen ${f.name} är för stor. Max ${(maxSize / 1024 / 1024).toFixed(0)} MB (zip kan vara större).`,
        );
        return;
      }
    }

    if (onFilesSelect) {
      await onFilesSelect(files);
      return;
    }
    if (onFileSelect) {
      for (const f of files) {
        await onFileSelect(f);
      }
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      await handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      className={cn(
        'border-2 border-dashed rounded-lg p-8 transition-all duration-200',
        isDragging
          ? 'border-primary bg-primary/5 scale-[1.02]'
          : 'border-border hover:border-primary/50 hover:bg-accent/50',
        uploading && 'opacity-50 pointer-events-none',
      )}
    >
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <div
          className={cn(
            'p-4 rounded-full transition-colors',
            isDragging ? 'bg-primary/20' : 'bg-muted',
          )}
        >
          <CloudUpload
            className={cn(
              'h-8 w-8',
              isDragging ? 'text-primary' : 'text-muted-foreground',
            )}
          />
        </div>
        <div>
          <p className="font-medium text-sm">
            Dra och släpp filer eller en <span className="text-primary">.zip</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            PDF, Word, Excel, text, bilder — indexeras för Jarvis (max 40 filer / batch)
          </p>
          {progressText && (
            <p className="text-xs text-primary mt-2 font-medium">{progressText}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            Välj filer / zip
          </Button>
          {allowFolder && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => folderInputRef.current?.click()}
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              Välj mapp
            </Button>
          )}
        </div>
        <Input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={accept}
          multiple
          onChange={async (e) => {
            if (e.target.files?.length) await handleFiles(e.target.files);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
        {allowFolder && (
          <Input
            ref={folderInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={async (e) => {
              if (e.target.files?.length) await handleFiles(e.target.files);
              if (folderInputRef.current) folderInputRef.current.value = '';
            }}
          />
        )}
      </div>
    </div>
  );
}
