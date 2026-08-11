# Liljeblads + Jarvis — plan för att bli bättre

**Status:** P0–P3 + spår B/C är levererade. Connectors (SharePoint/Drive) väntar medvetet.  
**Nordstjärna:** Snabbare och mer pålitlig än att klicka runt i UI:et — utan att tappa kontroll, spår eller org-isolation.

---

## 1. Var vi är (baslinje)

| Lager | Starkt | Svagt / nästa |
|-------|--------|----------------|
| **Produkt** | Slimmad kärna (fastighet, WO, projekt, komponent, Jarvis) | Vana saknas hos alla användare; “när använder man vad?” |
| **Jarvis** | Läs + apply + HITL + undo + batch + zip-in + logg | Ibland “pratar” utan apply; index-lagg på PDF; ingen proaktiv rutin default |
| **Data/trust** | Org-scope, action log, rate limits, unit-eval | Få regressionstester mot live-org; ingen månadsmätning av fel |
| **Drift** | Edge + migreringar + Vercel | Embedding-kö måste köras; briefing-cron opt-in |
| **Extern data** | Upload/zip in i systemet | Connectors later |

---

## 2. Principer (håll hårt)

1. **Truth from tools** — gissa aldrig fakturaadress, status, kostnad.  
2. **Org isolation** — aldrig lita på klient-id utan org-check.  
3. **Least privilege out** — e-post bara till inloggad användare (tills ni aktivt ändrar policy).  
4. **Explicit vs suggest** — order → apply; osäker idé → HITL.  
5. **Audit everything** — apply/send i `jarvis_action_log`.  
6. **Innan utåt: inåt** — mer värde i Liljeblads innan OAuth-connectors.  
7. **Mät eller det hände inte** — kill metrics nedan.

---

## 3. Fasplan (rekommenderad ordning)

### Fas 0 — Stabilisera (1–2 veckor) · *gör först*

**Mål:** Det ni byggt fungerar varje dag utan er “i loopen”.

| Åtgärd | Varför |
|--------|--------|
| Checklista morgon: embedding-kö tom / “AI-indexerad” på nya PDF | Annars “Jarvis hittar inte dokumentet” |
| Schemalägg `jarvis-daily-briefing` + `generate-embeddings` om inte redan | Proaktivitet + index utan manuell knapp |
| 10 svenska “golden prompts” per org (WO, faktura, risk, doc, ångra, kostnad) | Upptäcker regression innan användare gör det |
| Kör `npm run ci:jarvis` i CI (GitHub Action) | Lås policy (e-postblock, rate, grounding) |
| Kort intern cheatsheet (1 sida) | Sänker tröskel: “säg så här till Jarvis” |

**Klart när:** en icke-grundare klarar skapa WO, hitta fakturaadress, se logg, ladda PDF utan er.

---

### Fas 1 — “Kan inte jobba utan” i systemet (2–4 veckor)

**Mål:** Jarvis täcker 80 % av förvaltarens klickvägar.

| Spår | Leverans | Effekt |
|------|----------|--------|
| **1A Intent-säkring** | Om användaren säger “skapa/ändra/logga” och modell inte anropar apply → tvinga omplanering eller tydligt fel | Färre “bara text”-svar |
| **1B Read-after-write** | Efter apply: alltid läs tillbaka rad och visa i kort | Högre tillit |
| **1C Disambiguation** | 2+ träffar → “Menade du A eller B?” (skapa inte) | Färre fel WO |
| **1D Domän-CRUD** | Underhållsplan-rader, energidata, påminnelser, WO-länk till projekt/komponent | Färre “kan inte via chat” |
| **1E Protokoll → förslag** | Befintlig protocol-analys tätare mot HITL + apply | PDF blir action |
| **1F UI-polish** | Deep-link till rätt WO-dialog, toast + Logg alltid i sync | Känns “native” |

**Klart när:** tid till sparad WO via Jarvis ≤ 50 % av manuell väg (mät stickprov).

---

### Fas 2 — Trust & kvalitet (parallellt med Fas 1, löpande)

| Leverans | |
|----------|--|
| Eval-set 30–50 frågor (fixture-org eller anonymiserad dump) i CI | |
| Dashboard “Jarvis health”: apply success %, undo rate, send_to_me fail, pending HITL | |
| PII-redaction i loggar (delvis finns) + retention-policy | |
| Founder break-glass-logg när man hoppar org | |
| Destructive (radera/arkivera) alltid `confirm: true` + HITL | |

**Kill metrics (följ varje månad)**  
1. Tid till sparad WO (Jarvis vs manuell)  
2. Andel apply som lyckas första gången  
3. “Fel data”-klagomål / support  
4. send_to_me success rate  
5. DAU som öppnar Jarvis  
6. Andel dokument med AI-index inom 15 min efter upload  

---

### Fas 3 — Vanor & proaktivitet (2–3 veckor)

| Leverans | |
|----------|--|
| Daily briefing på som standard (owner/admin), avstängbart per org | |
| Watch rules: “meddela mig om WO > 50k / förfallen / högrisk” | |
| Org-glossary: Axcell, LEA, era projektnummer-mönster | |
| “Senaste åtgärder” även i bubble, inte bara Logg-flik | |

**Klart när:** briefing öppnas eller mejlas ≥ 3 dagar/vecka av kärnanvändare.

---

### Fas 4 — Extern data in, säkert (när ni är redo — *väntar nu*)

**Policy oförändrad:** läs-only, OAuth, mapp-picker, audit, ingen fri path.

1. Upload/zip (klart)  
2. OneDrive/SharePoint connector  
3. Semantisk sök över connector-index  
4. Citat med länk tillbaka till källfil  
5. (Mycket senare) externa skrivningar med HITL  

---

### Fas 5 — Skala & plattform (senare)

| Område | |
|--------|--|
| Multi-tenant performance (index, RLS, cold start) | |
| Roller: förvaltare vs read-only vs founder (tydligare i UI) | |
| Offline/PWA: köa läs, blockera apply offline | |
| Voice → samma tools (kontorsläge) | |
| White-label / fler org utan founder-stöd | |

---

## 4. Produkt: hur “bättre” känns för användaren

| Situation | Idag | Bättre |
|-----------|------|--------|
| Ny servicerapport | Ladda upp, hoppas på index | Zip → badge “indexeras…” → Jarvis “enligt fil X…” |
| Beställning | Chat skapar WO + text | Kort: Öppna + beställningsutkast + mejl till dig |
| Måndag morgon | Öppna dashboard | Briefing i mejl + Logg med gårdagens apply |
| Fel klick | Manuell rättning | Ångra 5 min alltid synlig |
| Osäker AI | Textförslag | HITL-inkorg med ett klick godkänn |

---

## 5. Teknikskuld att inte glömma

| Skuld | Risk om ignorerad |
|-------|-------------------|
| Embedding-kö / cron | “Dokument finns men Jarvis ser dem inte” |
| Tool-selects vs schema-drift | “Saknas”-svar trots data |
| Model tool_choice=auto | Hoppar apply trots explicit order |
| Typer/generated `types.ts` manuellt patchade | Merge-konflikter |
| Rate limits fail-open | Vid DB-fel ingen gräns (medvetet — övervaka) |

---

## 6. Förslag: nästa 30 dagar (utan connectors)

| Vecka | Fokus |
|-------|--------|
| **1** | Fas 0: cron, cheatsheet, golden prompts, CI `ci:jarvis` |
| **2** | Fas 1A–1C: intent-säkring, disambiguation, read-after-write |
| **3** | Fas 1D–1E: mer domän-CRUD + protokoll→HITL |
| **4** | Fas 2 metrics + Fas 3 briefing default; retrospektiv kill metrics |

**Efter 30 dagar:** bestäm om connectors (Fas 4) eller mer förvaltning (Fas 1D) ger mest tid tillbaka.

---

## 7. Beslut ni kan parkera

| Fråga | Rekommendation |
|-------|----------------|
| Mejl till `notification_email` ≠ auth email? | Nej tills verifierad samma person |
| Radera alltid HITL? | Ja |
| Första externa: zip (klart) vs SharePoint? | SharePoint när Fas 0–2 sitter |
| Flera agent-personas? | Nej — en Jarvis |

---

## 8. Definition of Done för “kan inte jobba utan”

- [ ] Golden prompts gröna i CI/staging  
- [ ] ≥ 70 % av nya WO skapas via Jarvis i en pilotorg (eller mätbart delmål)  
- [ ] Dokument indexerade inom 15 min (p95)  
- [ ] Undo används utan support-ärende  
- [ ] Inga kända cross-org läckor i isolation-tester  
- [ ] Briefing eller Logg tittas ≥ 3×/vecka av kärnanvändare  

---

*Senast uppdaterad: efter P0–P3 + B/C. Connectors medvetet senare.*
