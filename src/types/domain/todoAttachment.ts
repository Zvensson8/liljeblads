/**
 * todo_attachments is not yet present in the generated Supabase types, so
 * we declare the domain shape here. Keep in sync with the actual table.
 */
export interface TodoAttachment {
  id: string;
  todo_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export type TodoAttachmentCountMap = Record<string, number>;
