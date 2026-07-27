# Vad du behöver göra (Liljeblads prod)

Allt nedan är saker som **kräver dig** (dashboard, konton, hemligheter, domän).
Kod, migrationer, CRON_SECRET och edge functions har satts upp så långt det går automatiskt.

---

## 1. Säkerhet – gör nu (5 min)

### A. Rotera access token
Du delade en personal access token (`sbp_...`) i chatten.

1. Gå till https://supabase.com/dashboard/account/tokens  
2. **Revoke** den gamla tokenen  
3. Skapa en ny om du behöver CLI igen  

### B. Spara CRON_SECRET
En stark `CRON_SECRET` genererades och sparades i:

`C:\Users\andre\Documents\liljeblads\.secrets.local`

- Filen är gitignorerad  
- Använd samma värde i cron-jobb (header `x-cron-secret`)  
- Radera inte filen förrän du sparat secret någonstans säkert (password manager)

---

## 2. Supabase Auth (5–10 min)

Öppna: https://supabase.com/dashboard/project/ojiswgqntenvbwtopxbu/auth/url-configuration

| Fält | Värde |
|------|--------|
| **Site URL** | `http://localhost:8080` (byt till din prod-URL senare) |
| **Redirect URLs** | `http://localhost:8080/**` och senare `https://din-domän/**` |

**Authentication → Providers**

- Email: **på**
- Confirm email: valfritt (av för snabb lokal test; på i produktion rekommenderas)
- Google OAuth: valfritt

**Authentication → Policies / Password**

- Minst 12 tecken rekommenderas (appen validerar redan komplexitet vid registrering)

---

## 3. Skapa ditt konto (automatisk onboarding)

1. Öppna http://localhost:8080  
2. **Registrera** dig med din e-post  
3. Vid första inlogg anropas `ensure_my_workspace` automatiskt:
   - skapar organisation
   - dig som **owner**
   - **första** användaren i systemet får **founder + admin**
   - `approved = true`

Ingen manuell SQL behövs för normal onboarding.

Om något går fel: se `docs/bootstrap-first-admin.sql` som nödåtgärd.

---

## 3b. Jarvis (LangGraph) – servicerapporter

Se **`docs/JARVIS.md`**. Kort:

```powershell
cd C:\Users\andre\Documents\liljeblads\jarvis-worker
# .env med LILJEBLADS_API_KEY + GOOGLE_API_KEY
# Lägg PDF i inbox\
.\.venv\Scripts\python.exe -m jarvis_worker.cli ingest
```

---

## 4. E-post & cron (Resend)

**Full guide:** [`docs/EMAIL_AND_CRON.md`](./EMAIL_AND_CRON.md)

```powershell
cd C:\Users\andre\Documents\liljeblads
npx supabase secrets set RESEND_API_KEY=re_DIN_NYCKEL
```

Sedan: skapa cron-jobb i Dashboard med header `x-cron-secret` (värde i `.secrets.local`).

Övriga secrets (valfritt):

```powershell
npx supabase secrets set GOOGLE_AI_API_KEY=xxx
npx supabase secrets set GEMINI_MODEL=gemini-flash-latest
npx supabase secrets set LLM_PROVIDER=gemini
```

| Secret | Status |
|--------|--------|
| `CRON_SECRET` | ✅ satt |
| `ALLOWED_ORIGINS` | ✅ satt (localhost) |
| `RESEND_API_KEY` | ❌ du sätter |
| `GOOGLE_AI_API_KEY` | ✅ chat + embeddings (Gemini) |
| `LOVABLE_API_KEY` | ❌ borttaget – används inte |

---

## 6. Frontend-hosting (produktion)

```powershell
cd C:\Users\andre\Documents\liljeblads
npm run build
```

Ladda upp mappen `dist/` till t.ex.:

- Cloudflare Pages  
- Netlify  
- Vercel  
- IIS / nginx  

Sätt **build-time** env:

```
VITE_SUPABASE_URL=https://ojiswgqntenvbwtopxbu.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<din publishable key>
VITE_SUPABASE_PROJECT_ID=ojiswgqntenvbwtopxbu
```

Uppdatera sedan Auth Site URL till den publika domänen.

---

## 7. Dataimport (valfritt)

Export finns bl.a. i:

- `Downloads\Liljeblads_full_export_2026-07-08.zip`
- `Downloads\Liljeblads_1_properties_*.json`

Importera via appens CSV/XLSX eller manuellt. Automatisk bulk-import av hela historiken är inte inkopplad.

---

## 8. Lokal utveckling

```powershell
cd C:\Users\andre\Documents\liljeblads
npm install
npm run dev
```

Öppna: http://localhost:8080

---

## Checklista – kryssa av

- [ ] Rotera `sbp_`-token  
- [ ] Spara `CRON_SECRET` från `.secrets.local`  
- [ ] Auth Site URL + Redirect URLs  
- [ ] Skapa konto + SQL founder/org  
- [ ] (Valfritt) RESEND / GOOGLE / AI-nycklar  
- [ ] (Valfritt) Cron-scheman med `x-cron-secret`  
- [ ] (Valfritt) Deploy `dist/` + prod-domän  
- [ ] (Valfritt) Importera data  

När 1–3 är klara kan du använda systemet lokalt som admin.
