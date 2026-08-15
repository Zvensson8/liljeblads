/**
 * Repair Swedish letters that were UTF-8 decoded as CP437/CP850 and saved again.
 * "Fläktrum" → "Fl├ñktrum", "utifrån" → "utifr├Ñn".
 */
const REPLACEMENTS: Array<[string, string]> = [
  ["├ñ", "ä"],
  ["├Ñ", "å"],
  ["├à", "Å"],
  ["├ä", "Ä"],
  ["├╢", "ö"],
  ["├░", "ö"],
  ["├Â", "ö"],
  ["├û", "Ö"],
  ["├®", "é"],
  ["├¿", "é"],
  ["Ã¤", "ä"],
  ["Ã¶", "ö"],
  ["Ã¥", "å"],
  ["Ã„", "Ä"],
  ["Ã–", "Ö"],
  ["Ã…", "Å"],
];

export function repairSwedishMojibake(value: string): string {
  let out = value;
  for (const [bad, good] of REPLACEMENTS) {
    if (out.includes(bad)) out = out.split(bad).join(good);
  }
  return out;
}

export function repairMaybe(value: string | null | undefined): string | null {
  if (value == null) return null;
  return repairSwedishMojibake(value);
}

/** Decode a CSV/text file as UTF-8, falling back to Windows-1252 if needed. */
export function decodeImportedText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (utf8.includes("\uFFFD")) {
    return new TextDecoder("windows-1252").decode(bytes);
  }
  return repairSwedishMojibake(utf8);
}

export function repairImportValue(
  value: string | number | null | undefined,
): string | number | null | undefined {
  return typeof value === "string" ? repairSwedishMojibake(value) : value;
}
