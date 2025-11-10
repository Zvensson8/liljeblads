import { supabase } from "@/integrations/supabase/client";

export interface EnergyGradeColor {
  bg: string;
  text: string;
  border: string;
}

export const energyGradeColors: Record<string, EnergyGradeColor> = {
  'A': { bg: 'bg-green-700', text: 'text-white', border: 'border-green-700' },
  'B': { bg: 'bg-green-500', text: 'text-white', border: 'border-green-500' },
  'C': { bg: 'bg-lime-400', text: 'text-gray-900', border: 'border-lime-400' },
  'D': { bg: 'bg-yellow-400', text: 'text-gray-900', border: 'border-yellow-400' },
  'E': { bg: 'bg-orange-400', text: 'text-white', border: 'border-orange-400' },
  'F': { bg: 'bg-red-400', text: 'text-white', border: 'border-red-400' },
  'G': { bg: 'bg-red-700', text: 'text-white', border: 'border-red-700' },
};

export function getEnergyGradeColor(grade: string | null): EnergyGradeColor {
  if (!grade) {
    return { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' };
  }
  return energyGradeColors[grade.toUpperCase()] || energyGradeColors['G'];
}

export interface EnergyImprovement {
  percentage: number;
  isImprovement: boolean;
}

export function calculateEnergyImprovement(
  current: number,
  previous: number
): EnergyImprovement {
  if (!previous || previous === 0) {
    return { percentage: 0, isImprovement: false };
  }
  
  const percentage = Math.abs(((current - previous) / previous) * 100);
  const isImprovement = current < previous; // Lower energy use is better
  
  return { percentage: Math.round(percentage), isImprovement };
}

export function formatEnergyValue(value: number | null, unit: string): string {
  if (value === null || value === undefined) return '-';
  return `${value.toLocaleString('sv-SE')} ${unit}`;
}

export interface EnergyHistory {
  id: string;
  property_id: string;
  energy_grade: string | null;
  primary_energy_number: number | null;
  specific_energy_use: number | null;
  recorded_at: string;
  created_by: string | null;
}

export async function getLatestEnergyHistory(propertyId: string): Promise<EnergyHistory | null> {
  const { data, error } = await supabase
    .from('property_energy_history')
    .select('*')
    .eq('property_id', propertyId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching energy history:', error);
    return null;
  }

  return data;
}

export async function getPreviousEnergyHistory(propertyId: string): Promise<EnergyHistory | null> {
  const { data, error } = await supabase
    .from('property_energy_history')
    .select('*')
    .eq('property_id', propertyId)
    .order('recorded_at', { ascending: false })
    .limit(2);

  if (error) {
    console.error('Error fetching previous energy history:', error);
    return null;
  }

  // Return the second item (previous record)
  return data && data.length > 1 ? data[1] : null;
}
