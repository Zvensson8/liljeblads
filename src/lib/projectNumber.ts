/**
 * External project numbers are {propertyNumber}{+|-}{digits}.
 * The property number is the stem; the user only adds the suffix.
 */
export function normalizeProjectNumber(
  raw: string,
  propertyNumber: string | null | undefined,
): { ok: true; value: string } | { ok: false; message: string } {
  const stem = (propertyNumber ?? '').trim();
  if (!stem) {
    return { ok: false, message: 'Fastigheten saknar fastighetsnummer' };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: 'Ange +xx eller -xx efter fastighetsnumret' };
  }

  const value = /^[+-]\d+$/.test(trimmed) ? `${stem}${trimmed}` : trimmed;
  if (!value.startsWith(stem)) {
    return { ok: false, message: `Projektnumret måste börja med ${stem}` };
  }

  const suffix = value.slice(stem.length);
  if (!/^[+-]\d+$/.test(suffix)) {
    return { ok: false, message: `Lägg till +xx eller -xx efter ${stem}` };
  }

  return { ok: true, value };
}

export function projectNumberStem(propertyNumber: string | null | undefined): string {
  return (propertyNumber ?? '').trim();
}
