import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PropertyInfoField } from "@/types/propertyInfo";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface CategoryFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field?: PropertyInfoField;
  categoryId: string;
  onSave: (field: Partial<PropertyInfoField>) => void;
}

const fieldTypes = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Nummer' },
  { value: 'date', label: 'Datum' },
  { value: 'boolean', label: 'Ja/Nej' },
  { value: 'select', label: 'Dropdown' },
  { value: 'textarea', label: 'Textområde' },
];

export function CategoryFieldDialog({
  open,
  onOpenChange,
  field,
  categoryId,
  onSave,
}: CategoryFieldDialogProps) {
  const [fieldName, setFieldName] = useState('');
  const [fieldType, setFieldType] = useState<string>('text');
  const [options, setOptions] = useState<string[]>([]);
  const [currentOption, setCurrentOption] = useState('');
  const [unit, setUnit] = useState('');
  const [placeholder, setPlaceholder] = useState('');
  const [helpText, setHelpText] = useState('');
  const [required, setRequired] = useState(false);

  useEffect(() => {
    if (field) {
      setFieldName(field.field_name);
      setFieldType(field.field_type);
      setOptions(field.options || []);
      setUnit(field.unit || '');
      setPlaceholder(field.placeholder || '');
      setHelpText(field.help_text || '');
      setRequired(field.required);
    } else {
      resetForm();
    }
  }, [field, open]);

  const resetForm = () => {
    setFieldName('');
    setFieldType('text');
    setOptions([]);
    setCurrentOption('');
    setUnit('');
    setPlaceholder('');
    setHelpText('');
    setRequired(false);
  };

  const handleAddOption = () => {
    if (currentOption.trim() && !options.includes(currentOption.trim())) {
      setOptions([...options, currentOption.trim()]);
      setCurrentOption('');
    }
  };

  const handleRemoveOption = (option: string) => {
    setOptions(options.filter(o => o !== option));
  };

  const handleSave = () => {
    const fieldData: Partial<PropertyInfoField> = {
      category_id: categoryId,
      field_name: fieldName,
      field_type: fieldType as PropertyInfoField['field_type'],
      placeholder,
      help_text: helpText,
      required,
    };

    if (fieldType === 'select') {
      fieldData.options = options;
    }

    if (fieldType === 'number') {
      fieldData.unit = unit;
    }

    if (field) {
      fieldData.id = field.id;
    }

    onSave(fieldData);
    onOpenChange(false);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{field ? 'Redigera fält' : 'Skapa nytt fält'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Fältnamn *</Label>
            <Input
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              placeholder="t.ex. Värmesystem"
            />
          </div>

          <div className="space-y-2">
            <Label>Fälttyp *</Label>
            <Select value={fieldType} onValueChange={setFieldType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fieldTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {fieldType === 'select' && (
            <div className="space-y-2">
              <Label>Alternativ</Label>
              <div className="flex gap-2">
                <Input
                  value={currentOption}
                  onChange={(e) => setCurrentOption(e.target.value)}
                  placeholder="Lägg till alternativ"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddOption();
                    }
                  }}
                />
                <Button type="button" onClick={handleAddOption}>
                  Lägg till
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {options.map((option) => (
                  <Badge key={option} variant="secondary" className="gap-1">
                    {option}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => handleRemoveOption(option)}
                    />
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {fieldType === 'number' && (
            <div className="space-y-2">
              <Label>Enhet</Label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="t.ex. kr, m², st"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Platshållare</Label>
            <Input
              value={placeholder}
              onChange={(e) => setPlaceholder(e.target.value)}
              placeholder="Visas i tomt fält"
            />
          </div>

          <div className="space-y-2">
            <Label>Hjälptext</Label>
            <Textarea
              value={helpText}
              onChange={(e) => setHelpText(e.target.value)}
              placeholder="Förklarande text under fältet"
              rows={2}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="required"
              checked={required}
              onCheckedChange={setRequired}
            />
            <Label htmlFor="required">Obligatoriskt fält</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={!fieldName || !fieldType}>
            {field ? 'Uppdatera' : 'Skapa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
