import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';

// CSV parsing function
export const parseCSV = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter((line) => line.trim());

        if (lines.length < 2) {
          reject(new Error('CSV-filen måste innehålla minst en rubrikrad och en datarad'));
          return;
        }

        const headers = lines[0].split(',').map((h) => h.trim());
        const data = [];

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map((v) => v.trim());
          const row: any = {};

          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });

          data.push(row);
        }

        resolve(data);
      } catch (error: any) {
        reject(new Error(`Fel vid parsing av CSV: ${error.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Kunde inte läsa filen'));
    };

    reader.readAsText(file);
  });
};

// Component type mapping
const componentTypeMap: Record<string, string> = {
  'SC1': 'SC1',
  'SC2': 'SC2',
  'SC3': 'SC3',
  'SC4.1.1.1': 'SC4.1.1.1',
  'SC4.1.1.2': 'SC4.1.1.2',
  'SC4.1.1.3': 'SC4.1.1.3',
  'SC4.1.2.1': 'SC4.1.2.1',
  'SC4.1.2.2': 'SC4.1.2.2',
  'SC4.1.2.3': 'SC4.1.2.3',
  'SC4.2.1.1': 'SC4.2.1.1',
  'SC4.2.1.2': 'SC4.2.1.2',
  'SC4.2.1.3': 'SC4.2.1.3',
  'SC4.2.2.1': 'SC4.2.2.1',
  'SC4.2.2.2': 'SC4.2.2.2',
  'SC4.2.2.3': 'SC4.2.2.3',
  'SC4.3.1.1': 'SC4.3.1.1',
  'SC4.3.1.2': 'SC4.3.1.2',
  'SC4.3.1.3': 'SC4.3.1.3',
  'SC4.3.2.1': 'SC4.3.2.1',
  'SC4.3.2.2': 'SC4.3.2.2',
  'SC4.3.2.3': 'SC4.3.2.3',
  'SC4.4.1.1': 'SC4.4.1.1',
  'SC4.4.1.2': 'SC4.4.1.2',
  'SC4.4.1.3': 'SC4.4.1.3',
  'SC4.4.2.1': 'SC4.4.2.1',
  'SC4.4.2.2': 'SC4.4.2.2',
  'SC4.4.2.3': 'SC4.4.2.3',
  'SC4.5.1.1': 'SC4.5.1.1',
  'SC4.5.1.2': 'SC4.5.1.2',
  'SC4.5.1.3': 'SC4.5.1.3',
  'SC4.5.2.1': 'SC4.5.2.1',
  'SC4.5.2.2': 'SC4.5.2.2',
  'SC4.5.2.3': 'SC4.5.2.3',
  'SC4.6.1.1': 'SC4.6.1.1',
  'SC4.6.1.2': 'SC4.6.1.2',
  'SC4.6.1.3': 'SC4.6.1.3',
  'SC4.6.2.1': 'SC4.6.2.1',
  'SC4.6.2.2': 'SC4.6.2.2',
  'SC4.6.2.3': 'SC4.6.2.3',
  'SC4.6.2.4': 'SC4.6.2.4',
  'SC4.6.2.5': 'SC4.6.2.5',
  'SC4.6.2.6': 'SC4.6.2.6',
  'SC4.6.2.7': 'SC4.6.2.7',
  'SC4.6.2.8': 'SC4.6.2.8',
  'SC4.6.2.9': 'SC4.6.2.9',
  'SC5.1': 'SC5.1',
  'SC5.2': 'SC5.2',
  'SC5.3': 'SC5.3',
};

const statusMap: Record<string, string> = {
  'active': 'active',
  'aktiv': 'active',
  'maintenance': 'maintenance',
  'underhåll': 'maintenance',
  'inactive': 'inactive',
  'inaktiv': 'inactive',
  'decommissioned': 'decommissioned',
  'avvecklad': 'decommissioned',
};

// Validation schema
const componentSchema = z.object({
  name: z.string().min(1, 'Beteckning krävs'),
  type: z.string().min(1, 'Komponenttyp krävs'),
  floorName: z.string().min(1, 'Våning krävs'),
  registration_number: z.string().optional(),
  installation_year: z.number().optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serial_number: z.string().optional(),
  room_zone: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
  refrigerant_code: z.string().optional(),
  refrigerant_amount_kg: z.number().optional(),
  refrigerant_type: z.string().optional(),
});

interface ValidationResult {
  status: 'valid' | 'warning' | 'error';
  message: string;
  data: any;
  floorId?: string;
  floorName: string;
}

export const validateAndMatchComponents = async (
  csvData: any[],
  propertyId: string
): Promise<ValidationResult[]> => {
  // Fetch all floors for this property
  const { data: floors, error: floorsError } = await supabase
    .from('floors')
    .select('id, name')
    .eq('property_id', propertyId);

  if (floorsError || !floors) {
    throw new Error('Kunde inte hämta våningar för fastigheten');
  }

  const floorMap = new Map(floors.map((f) => [f.name.toLowerCase(), f.id]));

  // Fetch existing components to check for duplicates
  const { data: existingComponents } = await supabase
    .from('components')
    .select('name, floor_id')
    .in('floor_id', floors.map((f) => f.id));

  const existingNames = new Set(
    existingComponents?.map((c) => `${c.name.toLowerCase()}-${c.floor_id}`) || []
  );

  const results: ValidationResult[] = [];

  for (const row of csvData) {
    const result: ValidationResult = {
      status: 'valid',
      message: 'Redo för import',
      data: {},
      floorName: row['Våning'] || '',
    };

    try {
      // Map CSV columns to database fields
      const mappedData = {
        name: row['Beteckning'],
        type: componentTypeMap[row['Komponenttyp']] || row['Komponenttyp'],
        floorName: row['Våning'],
        registration_number: row['Reg.nr'] || null,
        installation_year: row['Installationsår'] ? parseInt(row['Installationsår']) : null,
        manufacturer: row['Tillverkare'] || null,
        model: row['Modell'] || null,
        serial_number: row['Serie-ID'] || null,
        room_zone: row['Placering'] || null,
        status: statusMap[row['Status']?.toLowerCase()] || 'active',
        notes: row['Anteckningar'] || null,
        refrigerant_code: row['Kod'] || null,
        refrigerant_amount_kg: row['Fyllnadsmängd (kg)'] ? parseFloat(row['Fyllnadsmängd (kg)']) : null,
        refrigerant_type: row['Köldmedietyp'] || null,
      };

      // Validate with Zod
      componentSchema.parse(mappedData);

      // Check if floor exists
      const floorId = floorMap.get(mappedData.floorName.toLowerCase());
      if (!floorId) {
        result.status = 'error';
        result.message = `Våning "${mappedData.floorName}" finns inte`;
        result.data = mappedData;
        results.push(result);
        continue;
      }

      // Check for duplicates
      const duplicateKey = `${mappedData.name.toLowerCase()}-${floorId}`;
      if (existingNames.has(duplicateKey)) {
        result.status = 'warning';
        result.message = 'Komponent med samma beteckning finns redan på denna våning';
      }

      // Check if component type is valid
      if (!componentTypeMap[row['Komponenttyp']]) {
        result.status = 'warning';
        result.message = `Okänd komponenttyp: ${row['Komponenttyp']}`;
      }

      result.data = mappedData;
      result.floorId = floorId;
      results.push(result);
    } catch (error: any) {
      result.status = 'error';
      result.message = error.errors?.[0]?.message || 'Valideringsfel';
      result.data = row;
      results.push(result);
    }
  }

  return results;
};

export const importComponents = async (
  validatedComponents: ValidationResult[]
): Promise<{ success: number; failed: number }> => {
  let success = 0;
  let failed = 0;

  for (const component of validatedComponents) {
    if (component.status !== 'valid' || !component.floorId) {
      failed++;
      continue;
    }

    const { data, floorId } = component;

    const { error } = await supabase.from('components').insert({
      name: data.name,
      type: data.type,
      floor_id: floorId,
      registration_number: data.registration_number,
      installation_year: data.installation_year,
      manufacturer: data.manufacturer,
      model: data.model,
      serial_number: data.serial_number,
      room_zone: data.room_zone,
      status: data.status,
      notes: data.notes,
      refrigerant_code: data.refrigerant_code,
      refrigerant_amount_kg: data.refrigerant_amount_kg,
      refrigerant_type: data.refrigerant_type,
    });

    if (error) {
      console.error('Import error:', error);
      failed++;
    } else {
      success++;
    }
  }

  return { success, failed };
};
