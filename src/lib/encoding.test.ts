import { describe, expect, it } from "vitest";
import {
  decodeImportedText,
  repairImportValue,
  repairMaybe,
  repairSwedishMojibake,
} from "./encoding";

describe("repairSwedishMojibake", () => {
  it("repairs CP437/CP850 Swedish letters", () => {
    expect(repairSwedishMojibake("Fl├ñktrum")).toBe("Fläktrum");
    expect(repairSwedishMojibake("utifr├Ñn")).toBe("utifrån");
    expect(repairSwedishMojibake("k├Âldmedium")).toBe("köldmedium");
    expect(repairSwedishMojibake("entr├®")).toBe("entré");
  });

  it("repairs UTF-8 misread as Latin-1", () => {
    expect(repairSwedishMojibake("vÃ¤rme")).toBe("värme");
    expect(repairSwedishMojibake("Ã¶versyn")).toBe("översyn");
  });

  it("leaves correct Swedish alone", () => {
    expect(repairSwedishMojibake("Fläktrum, frånluft")).toBe("Fläktrum, frånluft");
  });
});

describe("repairMaybe", () => {
  it("returns null for nullish", () => {
    expect(repairMaybe(null)).toBeNull();
    expect(repairMaybe(undefined)).toBeNull();
  });
});

describe("decodeImportedText", () => {
  it("keeps UTF-8 Swedish", () => {
    const bytes = new TextEncoder().encode("Fläktrum");
    expect(decodeImportedText(bytes.buffer)).toBe("Fläktrum");
  });

  it("decodes Windows-1252 Swedish", () => {
    const bytes = Uint8Array.from([0x46, 0x6c, 0xe4, 0x6b, 0x74, 0x72, 0x75, 0x6d]);
    expect(decodeImportedText(bytes.buffer)).toBe("Fläktrum");
  });

  it("repairs already-mojibake UTF-8 text", () => {
    const bytes = new TextEncoder().encode("Fl├ñktrum");
    expect(decodeImportedText(bytes.buffer)).toBe("Fläktrum");
  });
});

describe("repairImportValue", () => {
  it("repairs strings and leaves numbers", () => {
    expect(repairImportValue("Fl├ñktrum")).toBe("Fläktrum");
    expect(repairImportValue(2020)).toBe(2020);
  });
});
