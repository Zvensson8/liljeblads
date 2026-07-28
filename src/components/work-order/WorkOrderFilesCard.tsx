import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Download, Eye, FileText, Trash2, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkOrderFile } from "@/services/supabase";

export interface WorkOrderFilesCardProps {
  files: WorkOrderFile[] | undefined;
  uploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPreview: (file: WorkOrderFile) => void;
  onDelete: (fileId: string, fileUrl: string) => void;
}

export function WorkOrderFilesCard({
  files,
  uploading,
  onUpload,
  onPreview,
  onDelete,
}: WorkOrderFilesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Filer
          <Label htmlFor="file-upload-detail" className="cursor-pointer">
            <Button size="sm" disabled={uploading} asChild>
              <span>
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? "Laddar upp..." : "Ladda upp fil"}
              </span>
            </Button>
          </Label>
          <Input
            id="file-upload-detail"
            type="file"
            className="hidden"
            onChange={onUpload}
            disabled={uploading}
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {files && files.length > 0 ? (
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {file.file_size ? `${(file.file_size / 1024).toFixed(1)} KB` : ""}
                      {" · "}
                      {format(new Date(file.created_at), "yyyy-MM-dd HH:mm", {
                        locale: sv,
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => onPreview(file)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => window.open(file.file_url, "_blank")}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(file.id, file.file_url)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            Inga filer uppladdade än
          </div>
        )}
      </CardContent>
    </Card>
  );
}
