export interface PropertyInfoCategory {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
  fields?: PropertyInfoField[];
}

export interface PropertyInfoField {
  id: string;
  category_id: string;
  field_name: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'textarea';
  options: string[] | null;
  unit: string | null;
  placeholder: string | null;
  help_text: string | null;
  display_order: number;
  required: boolean;
  created_at: string;
  updated_at: string;
}

export interface PropertyInfoValue {
  id: string;
  property_id: string;
  field_id: string;
  value: string;
  updated_at: string;
  updated_by: string | null;
}

export interface PropertyInfoWithCategory extends PropertyInfoValue {
  field: PropertyInfoField;
  category: PropertyInfoCategory;
}
