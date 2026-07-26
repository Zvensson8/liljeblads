import { PropertyInfoField, PropertyInfoValue } from "@/types/propertyInfo";
import { 
  Type, 
  Calendar, 
  ToggleLeft, 
  List, 
  FileText,
  LucideIcon 
} from "lucide-react";

export function formatFieldValue(value: string, field: PropertyInfoField): string {
  if (!value) return '-';
  
  switch (field.field_type) {
    case 'boolean':
      return value === 'true' ? 'Ja' : 'Nej';
    case 'number':
      return field.unit ? `${value} ${field.unit}` : value;
    case 'date':
      return new Date(value).toLocaleDateString('sv-SE');
    default:
      return value;
  }
}

export function validateFieldValue(value: string, field: PropertyInfoField): boolean {
  if (field.required && !value) return false;
  
  switch (field.field_type) {
    case 'number':
      return !isNaN(Number(value));
    case 'date':
      return !isNaN(Date.parse(value));
    case 'boolean':
      return value === 'true' || value === 'false';
    case 'select':
      return field.options ? field.options.includes(value) : true;
    default:
      return true;
  }
}

export function getFieldIcon(fieldType: string): LucideIcon {
  switch (fieldType) {
    case 'text':
      return Type;
    case 'number':
      return Type;
    case 'date':
      return Calendar;
    case 'boolean':
      return ToggleLeft;
    case 'select':
      return List;
    case 'textarea':
      return FileText;
    default:
      return Type;
  }
}

export function calculateCompletionPercentage(
  values: PropertyInfoValue[], 
  fields: PropertyInfoField[]
): number {
  if (fields.length === 0) return 0;
  
  const filledFields = values.filter(v => v.value && v.value.trim() !== '').length;
  return Math.round((filledFields / fields.length) * 100);
}
