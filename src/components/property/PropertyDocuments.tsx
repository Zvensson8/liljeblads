import { useState } from 'react';
import { getErrorMessage } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { storageService } from '@/services/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Trash2, Download, Eye, History, Sparkles, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { DocumentUploadZone } from '@/components/documents/DocumentUploadZone';
import { DocumentPreviewDialog } from '@/components/documents/DocumentPreviewDialog';
import type { Tables } from '@/integrations/supabase/types';
import { expandIngestFiles } from '@/lib/zipDocumentIngest';
import { uploadPropertyDocumentFile } from '@/lib/propertyDocumentUpload';

type PropertyDocumentRow = Tables<'property_documents'>;
type PropertyDocumentWithVersions = PropertyDocumentRow & {
  versions?: PropertyDocumentRow[];
};

interface PropertyDocumentsProps {
  propertyId: string;
}

export function PropertyDocuments({ propertyId }: PropertyDocumentsProps) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<PropertyDocumentWithVersions | null>(
    null,
  );
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: documents, refetch } = useQuery({
    queryKey: ['property-documents', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_documents')
        .select('*')
        .eq('property_id', propertyId)
        .eq('is_latest', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const { data: batches } = useQuery({
    queryKey: ['document-ingest-batches', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_ingest_batches')
        .select(
          'id, source, label, status, files_total, files_ok, files_failed, created_at, finished_at',
        )
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })
        .limit(8);
      if (error) {
        // Table may not exist until migration
        console.warn('ingest batches', error.message);
        return [];
      }
      return data || [];
    },
  });

  /** Which docs are already in the embeddings table (searchable by Jarvis chat). */
  const { data: indexedIds } = useQuery({
    queryKey: [
      'property-documents-indexed',
      propertyId,
      documents?.map((d) => d.id).join(','),
    ],
    enabled: !!documents?.length,
    queryFn: async () => {
      const ids = (documents || []).map((d) => d.id);
      if (!ids.length) return new Set<string>();
      const { data, error } = await supabase
        .from('embeddings')
        .select('source_id')
        .eq('source_table', 'property_documents')
        .in('source_id', ids);
      if (error) {
        console.warn('Could not load embedding status:', error.message);
        return new Set<string>();
      }
      return new Set((data || []).map((r) => r.source_id as string));
    },
  });

  const getDocumentVersions = async (docName: string) => {
    const { data, error } = await supabase
      .from('property_documents')
      .select('*')
      .eq('property_id', propertyId)
      .eq('name', docName)
      .order('version', { ascending: false });

    if (error) {
      console.error('Error fetching versions:', error);
      return [];
    }
    return data || [];
  };

  const resolveOrgId = async (): Promise<string | null> => {
    const { data: prop } = await supabase
      .from('properties')
      .select('organization_id')
      .eq('id', propertyId)
      .maybeSingle();
    return (prop?.organization_id as string) || null;
  };

  const handleFilesSelect = async (rawFiles: File[]) => {
    if (!session?.user) return;

    setUploading(true);
    setProgressText('Läser filer…');
    try {
      const expanded = await expandIngestFiles(rawFiles);
      if (!expanded.files.length) {
        toast.error(
          expanded.skipped.length
            ? `Inga giltiga filer. ${expanded.skipped[0]?.reason || ''}`
            : 'Inga filer att ladda upp',
        );
        return;
      }

      const orgId = await resolveOrgId();
      let batchId: string | null = null;
      if (orgId) {
        const { data: batch } = await supabase
          .from('document_ingest_batches')
          .insert({
            organization_id: orgId,
            property_id: propertyId,
            user_id: session.user.id,
            source: expanded.source,
            label:
              expanded.source === 'zip'
                ? rawFiles.find((f) => f.name.toLowerCase().endsWith('.zip'))?.name ||
                  'zip'
                : expanded.source === 'folder'
                  ? 'mapp'
                  : 'uppladdning',
            status: 'running',
            files_total: expanded.files.length,
            files_ok: 0,
            files_failed: 0,
          })
          .select('id')
          .single();
        batchId = batch?.id ?? null;
      }

      const docIds: string[] = [];
      let ok = 0;
      let failed = 0;
      const failNotes: string[] = [];

      for (let i = 0; i < expanded.files.length; i++) {
        const item = expanded.files[i];
        setProgressText(
          `Laddar upp ${i + 1}/${expanded.files.length}: ${item.file.name}`,
        );
        try {
          const saved = await uploadPropertyDocumentFile({
            propertyId,
            userId: session.user.id,
            file: item.file,
            nameOverride: item.file.name,
          });
          docIds.push(saved.id);
          ok++;
        } catch (e) {
          failed++;
          failNotes.push(
            `${item.file.name}: ${e instanceof Error ? e.message : 'fel'}`,
          );
        }
      }

      if (batchId) {
        await supabase
          .from('document_ingest_batches')
          .update({
            status: failed === 0 ? 'completed' : ok > 0 ? 'partial' : 'failed',
            files_ok: ok,
            files_failed: failed + expanded.skipped.length,
            document_ids: docIds,
            error_summary:
              [...expanded.skipped.map((s) => `${s.name}: ${s.reason}`), ...failNotes]
                .slice(0, 20)
                .join('\n') || null,
            finished_at: new Date().toISOString(),
          })
          .eq('id', batchId);
      }

      const skipMsg =
        expanded.skipped.length > 0
          ? ` (${expanded.skipped.length} hoppades över)`
          : '';
      if (ok > 0) {
        toast.success(
          `${ok} dokument uppladdade${skipMsg} — köas för Jarvis AI-index`,
        );
      } else {
        toast.error('Inga dokument kunde laddas upp' + skipMsg);
      }
      await refetch();
      await queryClient.invalidateQueries({
        queryKey: ['document-ingest-batches', propertyId],
      });
    } catch (error: unknown) {
      toast.error('Kunde inte ladda upp: ' + getErrorMessage(error));
    } finally {
      setUploading(false);
      setProgressText(null);
    }
  };

  const handleDeleteDocument = async (docId: string, fileUrl: string) => {
    try {
      const filePath = fileUrl.split('/').slice(-3).join('/');
      await storageService.remove('property-documents', [filePath]);

      const { error: dbError } = await supabase
        .from('property_documents')
        .delete()
        .eq('id', docId);

      if (dbError) throw dbError;

      toast.success('Dokument borttaget');
      refetch();
    } catch {
      toast.error('Kunde inte ta bort dokument');
    }
  };

  const handlePreview = async (doc: PropertyDocumentRow) => {
    const versions = await getDocumentVersions(doc.name);
    setSelectedDoc({ ...doc, versions });
    setPreviewOpen(true);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="border-dashed bg-muted/30">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Fastighetsmapp · AI-sökbar (P3)
          </CardTitle>
          <CardDescription className="text-xs">
            Ladda upp enstaka filer, en hel <strong>mapp</strong> eller en{' '}
            <strong>.zip</strong>. Innehållet stannar i Liljeblads och indexeras så
            Jarvis kan citera källor i chatten. Externa system (SharePoint m.m.) kommer
            som läs-only connectors senare.
          </CardDescription>
        </CardHeader>
      </Card>

      <DocumentUploadZone
        onFilesSelect={handleFilesSelect}
        uploading={uploading}
        progressText={progressText}
      />

      {batches && batches.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Archive className="h-4 w-4" />
              Senaste uppladdningsbatcher
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {batches.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between text-xs border rounded-md px-3 py-2"
              >
                <div>
                  <span className="font-medium">{b.label || b.source}</span>
                  <span className="text-muted-foreground ml-2">
                    {format(new Date(b.created_at), 'yyyy-MM-dd HH:mm', { locale: sv })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {b.files_ok}/{b.files_total} ok
                    {b.files_failed ? ` · ${b.files_failed} fel` : ''}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {b.status}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {documents && documents.length > 0 ? (
          documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{doc.name}</p>
                        {doc.version && doc.version > 1 && (
                          <Badge variant="secondary" className="text-xs">
                            v{doc.version}
                          </Badge>
                        )}
                        {indexedIds?.has(doc.id) ? (
                          <Badge
                            variant="outline"
                            className="text-xs gap-1 border-primary/40 text-primary"
                          >
                            <Sparkles className="h-3 w-3" />
                            AI-indexerad
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-xs text-muted-foreground"
                          >
                            Väntar index
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : ''}
                        {' · '}
                        {format(new Date(doc.created_at), 'yyyy-MM-dd HH:mm', {
                          locale: sv,
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handlePreview(doc)}
                      title="Förhandsgranska"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async () => {
                        const versions = await getDocumentVersions(doc.name);
                        if (versions.length > 1) {
                          setSelectedDoc({ ...doc, versions });
                          setPreviewOpen(true);
                        } else {
                          toast.info('Endast en version finns');
                        }
                      }}
                      title="Versionshistorik"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(doc.file_url, '_blank')}
                      title="Ladda ner"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteDocument(doc.id, doc.file_url)}
                      title="Ta bort"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            Inga dokument uppladdade än
          </div>
        )}
      </div>

      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        document={selectedDoc}
        versions={selectedDoc?.versions || []}
        onVersionSelect={(version) => {
          setSelectedDoc(version as PropertyDocumentRow);
        }}
      />
    </div>
  );
}
