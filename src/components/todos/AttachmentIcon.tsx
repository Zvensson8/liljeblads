import { FileText, Image, Table, File } from "lucide-react";

interface AttachmentIconProps {
  mimeType: string;
  fileName: string;
  className?: string;
}

export function AttachmentIcon({ mimeType, fileName, className = "h-4 w-4" }: AttachmentIconProps) {
  if (mimeType.startsWith("image/")) {
    return <Image className={className} />;
  }

  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
    return <FileText className={className} />;
  }

  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    fileName.match(/\.(xlsx?|csv)$/i)
  ) {
    return <Table className={className} />;
  }

  if (
    mimeType.includes("document") ||
    mimeType.includes("word") ||
    fileName.match(/\.(docx?|txt)$/i)
  ) {
    return <FileText className={className} />;
  }

  return <File className={className} />;
}
