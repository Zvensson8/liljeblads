import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';
import * as XLSX from 'xlsx';

// Parse CSV or XLSX file into array of objects
export const parseImportFile = (file: File): Promise<any[]> => {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') {
    return parseXLSX(file);
  }
  return parseCSV(file);
};

const parseXLSX = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', raw: false });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        if (rows.length === 0) {
          reject(new Error('Filen innehåller inga datarader'));
          return;
        }
        resolve(rows);
      } catch (error: any) {
        reject(new Error(`Fel vid parsing av Excel-fil: ${error.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Kunde inte läsa filen'));
    reader.readAsArrayBuffer(file);
  });
};

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

// Valid component types from database enum
const validComponentTypes = new Set([
  'SC1', 'SC2.1.1', 'SC2.3', 'SC2.3.1', 'SC2.3.3', 'SC2.3.4', 'SC2.3.7',
  'SC2.6.2', 'SC4.1.2.5.1', 'SC4.1.2.5.3', 'SC4.1.6.9', 'SC4.2.4.6',
  'SC4.2.4.7', 'SC4.5.1', 'SC4.6.2.6', 'SC4.6.2.6.1', 'SC4.7', 'SC5.5',
  'SC7.1', 'SC7.2',
]);

// Extract SC code from a string like "SC2.3 Entréer, Portar mm" -> "SC2.3"
const extractComponentType = (raw: string): { code: string; valid: boolean } => {
  const trimmed = raw.trim();
  // Try to match SC code pattern (most specific first)
  const match = trimmed.match(/^(SC[\d.]+)/);
  const code = match ? match[1] : trimmed;
  
  // Try progressively shorter codes if exact match fails
  // e.g. "SC2.3.4.5" -> try "SC2.3.4.5", "SC2.3.4", "SC2.3", "SC2"
  if (validComponentTypes.has(code)) {
    return { code, valid: true };
  }
  
  const parts = code.split('.');
  for (let i = parts.length - 1; i >= 1; i--) {
    const shorter = parts.slice(0, i).join('.');
    if (validComponentTypes.has(shorter)) {
      return { code: shorter, valid: true };
    }
  }
  
  return { code, valid: false };
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
  floorName: z.string().nullish(),
  propertyName: z.string().min(1, 'Fastighet krävs'),
  room_zone: z.string().min(1, 'Placering krävs'),
  registration_number: z.string().nullish(),
  installation_year: z.number().nullish(),
  manufacturer: z.string().nullish(),
  model: z.string().nullish(),
  serial_number: z.string().nullish(),
  status: z.string().nullish(),
  notes: z.string().nullish(),
  refrigerant_code: z.string().nullish(),
  refrigerant_amount_kg: z.number().nullish(),
  refrigerant_type: z.string().nullish(),
});

export interface ValidationResult {
  status: 'valid' | 'warning' | 'error' | 'duplicate';
  message: string;
  data: any;
  floorId?: string;
  propertyId?: string;
  floorName: string;
  propertyName?: string;
  duplicateOf?: { name: string; serial_number?: string; registration_number?: string };
  approved?: boolean;
}

export const validateAndMatchComponents = async (
  csvData: any[],
  propertyId: string | null
): Promise<ValidationResult[]> => {
  // Always fetch all properties for name matching
  const { data: propertiesData, error: propertiesError } = await supabase
    .from('properties')
    .select('id, name');

  if (propertiesError || !propertiesData) {
    throw new Error('Kunde inte hämta fastigheter');
  }

  const propertyMap = new Map(propertiesData.map((p) => [p.name.toLowerCase(), p.id]));

  // Fetch all floors
  const { data: floorsData, error: floorsError } = await supabase
    .from('floors')
    .select('id, name, property_id');

  if (floorsError || !floorsData) {
    throw new Error('Kunde inte hämta våningar');
  }

  const floorMap = new Map(
    floorsData.map((f) => [`${f.property_id}-${f.name.toLowerCase()}`, f.id])
  );

  // Fetch existing components to check for duplicates
  const { data: existingComponents } = await supabase
    .from('components')
    .select('name, floor_id, property_id, serial_number, registration_number');

  const existingNamesByFloor = new Set(
    existingComponents?.filter(c => c.floor_id).map((c) => `${c.name.toLowerCase()}-${c.floor_id}`) || []
  );
  const existingNamesByProperty = new Set(
    existingComponents?.map((c) => `${c.name.toLowerCase()}-${c.property_id}`) || []
  );

  // Build sets for serial_number and registration_number duplicate detection
  const existingSerials = new Map<string, { name: string; serial_number: string }>();
  const existingRegNrs = new Map<string, { name: string; registration_number: string }>();
  for (const c of existingComponents || []) {
    if (c.serial_number) {
      existingSerials.set(c.serial_number.toLowerCase(), { name: c.name, serial_number: c.serial_number });
    }
    if (c.registration_number) {
      existingRegNrs.set(c.registration_number.toLowerCase(), { name: c.name, registration_number: c.registration_number });
    }
  }

  const results: ValidationResult[] = [];

  for (const row of csvData) {
    // Flexible column name resolver
    const col = (primary: string, ...alts: string[]): string => {
      const val = row[primary];
      if (val !== undefined && val !== null) return String(val);
      for (const alt of alts) {
        if (row[alt] !== undefined && row[alt] !== null) return String(row[alt]);
      }
      return '';
    };

    const result: ValidationResult = {
      status: 'valid',
      message: 'Redo för import',
      data: {},
      floorName: col('Våning', 'Våningsplan', 'Floor'),
      propertyName: col('Fastighet', 'Property') || undefined,
    };

    try {
      // Extract component type code from full description (e.g. "SC2.3 Entréer, Portar mm" -> "SC2.3")
      const rawType = col('Komponenttyp', 'Typ', 'Type');
      const { code: typeCode, valid: typeValid } = extractComponentType(rawType);

      // Parse installation year from various formats
      const rawYear = col('Installationsår', 'Inst.år', 'Installation year');
      let installYear: number | null = null;
      if (rawYear) {
        const yearMatch = rawYear.match(/(\d{4})/);
        if (yearMatch) {
          installYear = parseInt(yearMatch[1]);
        } else {
          const parsed = parseInt(rawYear);
          if (!isNaN(parsed)) installYear = parsed;
        }
      }

      const mappedData = {
        name: col('Beteckning', 'Name'),
        type: typeCode,
        floorName: col('Våning', 'Våningsplan', 'Floor') || undefined,
        propertyName: col('Fastighet', 'Property') || undefined,
        registration_number: col('Reg.nr', 'Regnr', 'Registration number') || null,
        installation_year: installYear,
        manufacturer: col('Tillverkare', 'Manufacturer') || null,
        model: col('Modell', 'Model') || null,
        serial_number: col('Serie-ID', 'Serienummer', 'Serial number') || null,
        room_zone: col('Placering', 'Placement', 'Location'),
        status: statusMap[col('Status').toLowerCase()] || 'active',
        notes: col('Anteckningar', 'Kommentar', 'Notes') || null,
        refrigerant_code: col('Kod', 'Code') || null,
        refrigerant_amount_kg: col('Fyllnadsmängd (kg)') ? parseFloat(col('Fyllnadsmängd (kg)')) : null,
        refrigerant_type: col('Köldmedietyp') || null,
      };

      componentSchema.parse(mappedData);

      // Resolve property
      let propId: string | undefined;
      if (propertyId) {
        propId = propertyId;
      } else {
        propId = propertyMap.get(mappedData.propertyName!.toLowerCase());
        if (!propId) {
          result.status = 'error';
          result.message = `Fastighet "${mappedData.propertyName}" finns inte`;
          result.data = mappedData;
          results.push(result);
          continue;
        }
      }

      // Resolve floor (optional)
      let floorId: string | undefined;
      if (mappedData.floorName) {
        floorId = floorMap.get(`${propId}-${mappedData.floorName.toLowerCase()}`);
        if (!floorId) {
          result.status = 'warning';
          result.message = `Våning "${mappedData.floorName}" finns inte – komponenten importeras utan våning`;
        }
      }

      // Check for duplicates by serial_number or registration_number first
      let isDuplicate = false;
      if (mappedData.serial_number) {
        const existing = existingSerials.get(mappedData.serial_number.toLowerCase());
        if (existing) {
          result.status = 'duplicate';
          result.message = `Serie-ID "${mappedData.serial_number}" finns redan (${existing.name})`;
          result.duplicateOf = existing;
          isDuplicate = true;
        }
      }
      if (!isDuplicate && mappedData.registration_number) {
        const existing = existingRegNrs.get(mappedData.registration_number.toLowerCase());
        if (existing) {
          result.status = 'duplicate';
          result.message = `Reg.nr "${mappedData.registration_number}" finns redan (${existing.name})`;
          result.duplicateOf = existing;
          isDuplicate = true;
        }
      }

      // Check for name duplicates (warning only)
      if (!isDuplicate) {
        if (floorId) {
          const duplicateKey = `${mappedData.name.toLowerCase()}-${floorId}`;
          if (existingNamesByFloor.has(duplicateKey)) {
            result.status = 'warning';
            result.message = 'Komponent med samma beteckning finns redan på denna våning';
          }
        } else {
          const duplicateKey = `${mappedData.name.toLowerCase()}-${propId}`;
          if (existingNamesByProperty.has(duplicateKey)) {
            result.status = 'warning';
            result.message = 'Komponent med samma beteckning finns redan i denna fastighet';
          }
        }
      }

      if (!typeValid) {
        result.status = 'error';
        result.message = `Okänd komponenttyp: "${rawType}" (extraherad kod: ${typeCode})`;
      }

      result.data = mappedData;
      result.floorId = floorId;
      result.propertyId = propId;
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
    // Skip errors and unapproved duplicates
    if (component.status === 'error' || !component.propertyId) {
      failed++;
      continue;
    }
    if (component.status === 'duplicate' && !component.approved) {
      failed++;
      continue;
    }

    const { data, floorId, propertyId } = component;

    const { error } = await supabase.from('components').insert({
      name: data.name,
      type: data.type,
      floor_id: floorId || null,
      property_id: propertyId,
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
