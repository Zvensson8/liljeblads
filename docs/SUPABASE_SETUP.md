# Liljeblads – ny Supabase-databas

Guiden sätter upp en **ny** Supabase-instans och applicerar projektets migrationer
(inkl. baseline för kärntabeller som saknades i den ursprungliga Lovable-exporten).

## Förutsättningar

- Node.js 18+
- Konto på [supabase.com](https://supabase.com)
- Projektet installerat: `npm install --legacy-peer-deps`

## 1. Skapa projekt i Supabase

1. Gå till [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. **New project** → välj organisation, namn (t.ex. `liljeblads`), lösenord, region (t.ex. `eu-north-1`)
3. Vänta tills projektet är klart

## 2. Hämta API-nycklar

**Project Settings → API:**

| Variabel | Värde |
| -------- | ----- |
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `anon` / publishable key |
| `VITE_SUPABASE_PROJECT_ID` | Project reference id (subdomän) |

Kopiera `.env.example` → `.env` och fyll i värdena.

## 3. Logga in med Supabase CLI

```powershell
cd C:\Users\andre\Documents\liljeblads
npx supabase login
```

(Öppnar webbläsare / access token.)

## 4. Länka projektet

```powershell
npx supabase link --project-ref YOUR_PROJECT_REF
```

Du behöver **database password** som du satte vid skapandet.

## 5. Applicera migrationer

```powershell
npx supabase db push
```

Detta kör:

1. `20251001000000_baseline_core_schema.sql` – profiles, properties, floors, components, geometry, enums, auth-trigger
2. Övriga ~135 historiska migrationer (RLS, organisationer, projekt, embeddings, m.m.)

Om något steg faller: spara felmeddelandet och kör om efter fix. Lovable-migrationer kan ibland anta delvis data/state.

### Alternativ: SQL Editor

Om CLI inte fungerar kan du limma SQL-filer i ordning under **SQL Editor** i dashboarden (inte rekommenderat för 135 filer).

## 6. Storage buckets

Vissa buckets skapas i migrationer; kontrollera **Storage** i dashboarden. Minst:

- `floor-drawings` (baseline)
- övriga enligt migrationer (`component-documents`, `organization-logos`, m.m.)

## 7. Auth

**Authentication → Providers:**

- Email (på)
- Google OAuth om ni vill (kräver Google Cloud-klient)

**Authentication → URL configuration:**

- Site URL: `http://localhost:8080` (lokalt) / produktions-URL
- Redirect URLs: samma + `http://localhost:8080/**`

## 8. Edge Functions (valfritt först)

Kräver secrets (Resend, AI-nycklar, m.m.):

```powershell
npx supabase secrets set NAME=value
npx supabase functions deploy
```

Se `supabase/config.toml` för `verify_jwt = false` på cron/webhook-funktioner.

## 9. Starta appen

```powershell
npm run dev
```

Öppna http://localhost:8080, skapa konto. Första användaren kan behöva `approved = true` och admin-roll i SQL:

```sql
UPDATE public.profiles SET approved = true, role = 'admin' WHERE email = 'din@epost.se';
-- Efter att user_roles-tabellen finns:
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM public.profiles WHERE email = 'din@epost.se'
ON CONFLICT DO NOTHING;
```

## 10. Importera data (valfritt)

Export finns t.ex. i:

- `Downloads\Liljeblads_full_export_2026-07-08.zip` (textrapporter)
- `Downloads\Liljeblads_1_properties_*.json` / `.zip`

Importera via appens CSV/XLSX eller egna SQL/scripts – inte automatiskt via denna guide.

## Felsökning

| Problem | Åtgärd |
| ------- | ------ |
| `Access token not provided` | `npx supabase login` |
| Migration failer på CREATE TYPE | Typen finns redan – ofta OK att skippa / justera baseline |
| 401 från API | Fel URL/key i `.env`, starta om `npm run dev` |
| Peer deps vid install | `npm install --legacy-peer-deps` |
| Gamla Lovable-nycklar | Skapa **nytt** projekt; uppdatera `.env` |

## Säkerhet

- `.env` är gitignorerad – committa aldrig nycklar
- Använd endast **anon/publishable** key i frontend
- **service_role** endast i edge functions / server
- RLS måste vara på (aktiveras i migrationerna)
