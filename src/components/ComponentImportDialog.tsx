import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { parseCSV, validateAndMatchComponents, importComponents } from '@/lib/importUtils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ComponentImportDialogProps {
  propertyId: string;
  propertyName: string;
  onSuccess: () => void;
}

export const ComponentImportDialog = ({
  propertyId,
  propertyName,
  onSuccess,
}: ComponentImportDialogProps) => {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [validationResults, setValidationResults] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [stage, setStage] = useState<'upload' | 'preview'>('upload');
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      toast({
        title: 'Fel filtyp',
        description: 'Vänligen välj en CSV-fil',
        variant: 'destructive',
      });
      return;
    }

    setFile(selectedFile);

    try {
      const parsed = await parseCSV(selectedFile);
      setParsedData(parsed);

      const validated = await validateAndMatchComponents(parsed, propertyId);
      setValidationResults(validated);
      setStage('preview');
    } catch (error: any) {
      toast({
        title: 'Fel vid läsning av fil',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleImport = async () => {
    setImporting(true);

    try {
      const validComponents = validationResults.filter((r) => r.status === 'valid');
      const result = await importComponents(validComponents);

      toast({
        title: 'Import slutförd!',
        description: `${result.success} komponenter importerade, ${result.failed} misslyckades`,
      });

      if (result.success > 0) {
        onSuccess();
        handleClose();
      }
    } catch (error: any) {
      toast({
        title: 'Importfel',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setFile(null);
    setParsedData([]);
    setValidationResults([]);
    setStage('upload');
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'Beteckning',
      'Komponenttyp',
      'Våning',
      'Reg.nr',
      'Installationsår',
      'Tillverkare',
      'Modell',
      'Serie-ID',
      'Placering',
      'Status',
      'Anteckningar',
      'Kod',
      'Fyllnadsmängd (kg)',
      'Köldmedietyp',
    ];

    const exampleRow = [
      'VP-01-Källare',
      'SC4.6.2.6',
      'Källare',
      'REG-123',
      '2020',
      'NIBE',
      'F2120',
      'SN-123456',
      'Pannrum',
      'active',
      'Testkomponent',
      'R410A',
      '2.5',
      'R410A',
    ];

    const csvContent = [headers.join(','), exampleRow.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `komponent-mall-${propertyName}.csv`;
    link.click();

    toast({
      title: 'Mall nedladdad',
      description: 'CSV-mall har laddats ner',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'valid':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'valid':
        return <Badge variant="default" className="bg-green-600">OK</Badge>;
      case 'warning':
        return <Badge variant="default" className="bg-yellow-600">Varning</Badge>;
      case 'error':
        return <Badge variant="destructive">Fel</Badge>;
      default:
        return null;
    }
  };

  const validCount = validationResults.filter((r) => r.status === 'valid').length;
  const warningCount = validationResults.filter((r) => r.status === 'warning').length;
  const errorCount = validationResults.filter((r) => r.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Importera från CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importera komponenter från CSV</DialogTitle>
        </DialogHeader>

        {stage === 'upload' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csv-file">Välj CSV-fil</Label>
              <Input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
              />
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
              <div>
                <p className="font-medium">Behöver du en mall?</p>
                <p className="text-sm text-muted-foreground">
                  Ladda ner CSV-mall med rätt kolumner och exempel
                </p>
              </div>
              <Button variant="outline" onClick={handleDownloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Ladda ner mall
              </Button>
            </div>

            <div className="p-4 border rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">Obligatoriska kolumner:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Beteckning</li>
                <li>• Komponenttyp</li>
                <li>• Våning</li>
              </ul>
            </div>
          </div>
        )}

        {stage === 'preview' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex gap-4 mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm">{validCount} giltig(a)</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm">{warningCount} varning(ar)</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm">{errorCount} fel</span>
              </div>
            </div>

            <ScrollArea className="flex-1 border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Status</TableHead>
                    <TableHead>Beteckning</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Våning</TableHead>
                    <TableHead>Meddelande</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validationResults.map((result, index) => (
                    <TableRow key={index}>
                      <TableCell>{getStatusIcon(result.status)}</TableCell>
                      <TableCell className="font-medium">{result.data.name}</TableCell>
                      <TableCell>{result.data.type}</TableCell>
                      <TableCell>{result.floorName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(result.status)}
                          <span className="text-sm text-muted-foreground">
                            {result.message}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={handleClose}>
                Avbryt
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || validCount === 0}
              >
                {importing ? 'Importerar...' : `Importera ${validCount} komponenter`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
