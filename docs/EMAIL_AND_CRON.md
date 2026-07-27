# E-post (Resend) & cron-jobb

## 1. Skapa Resend-konto

1. Gå till [https://resend.com](https://resend.com) och skapa konto  
2. **API Keys** → skapa nyckel (`re_...`)  
3. (Produktion) Verifiera egen domän under **Domains**  
4. Utan egen domän: använd `onboarding@resend.dev` (endast till din Resend-kontomail)

## 2. Sätt secrets i Supabase

```powershell
cd C:\Users\andre\Documents\liljeblads

npx supabase secrets set RESEND_API_KEY=re_DIN_NYCKEL
# Valfritt — din verifierade avsändare:
npx supabase secrets set RESEND_FROM_EMAIL="Liljeblads <noreply@din-doman.se>"
```

`CRON_SECRET` är redan satt (se `.secrets.local`).

Lista secrets (endast namn/digest):

```powershell
npx supabase secrets list
```

## 3. Schemalägg cron (Dashboard)

Supabase Dashboard → **Integrations → Cron** (eller Database → Cron Jobs)

Skapa jobb som anropar edge functions **varje timme** (påminnelser avgör själva om det är dags):

| Namn | URL | Schema |
|------|-----|--------|
| `check-reminders` | `https://ojiswgqntenvbwtopxbu.supabase.co/functions/v1/check-and-send-reminders` | `0 * * * *` |
| `todo-reminders` | `.../functions/v1/send-todo-reminders` | `0 * * * *` |
| `work-order-reminders` | `.../functions/v1/send-work-order-reminders` | `0 7 * * *` |
| `maintenance-reminders` | `.../functions/v1/send-maintenance-reminders` | `0 7 * * 1` |
| `risk-suggest-actions` | `.../functions/v1/risk-suggest-actions` | `0 6 * * *` (dagligen 06:00 UTC) |
| `generate-embeddings` | `.../functions/v1/generate-embeddings` | `*/15 * * * *` (kö-poll) |

**Headers (obligatoriskt):**

```http
x-cron-secret: <värdet från .secrets.local CRON_SECRET>
Content-Type: application/json
```

Utan `x-cron-secret` får du **401 Unauthorized**.

### Alternativ: SQL (pg_net) om du har behörighet

```sql
-- Exempel — kräver extensions pg_cron + pg_net och rättigheter
-- Ersätt CRON_SECRET_VALUE

SELECT cron.schedule(
  'check-and-send-reminders-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ojiswgqntenvbwtopxbu.supabase.co/functions/v1/check-and-send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'CRON_SECRET_VALUE'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

## 4. Manuell test

```powershell
$secret = (Get-Content .secrets.local | Where-Object { $_ -match '^CRON_SECRET=' }) -replace 'CRON_SECRET=',''
Invoke-RestMethod `
  -Uri "https://ojiswgqntenvbwtopxbu.supabase.co/functions/v1/send-todo-reminders" `
  -Method POST `
  -Headers @{ "x-cron-secret" = $secret; "Content-Type" = "application/json" } `
  -Body "{}"

# Prediktiv risk → AI-förslag (HITL)
Invoke-RestMethod `
  -Uri "https://ojiswgqntenvbwtopxbu.supabase.co/functions/v1/risk-suggest-actions" `
  -Method POST `
  -Headers @{ "x-cron-secret" = $secret; "Content-Type" = "application/json" } `
  -Body "{}"
```

- **503** + `RESEND_API_KEY is not configured` → sätt secret  
- **401** → fel CRON_SECRET  
- **200** → ok (kan ha skickat 0 mail om inga todos är due)

## 5. App-inställningar

I appen: **Organisation / Användarinställningar → Notiser**  
Sätt e-post och frekvenser. Utan preferenser skickas färre mail.

## Funktioner som använder Resend

- `send-todo-reminders`
- `send-work-order-reminders`
- `send-maintenance-reminders`
- `send-monthly-project-summary`
- `send-monthly-workorder-summary`
- `send-maintenance-history-annual`
- `send-work-order-draft` / `send-project-order-draft` / `send-property-info`
- `check-and-send-reminders` (orkestrerar flera ovan)

Schemalagda PDF-rapporter (`generate-scheduled-reports`) är **avstängda** i UI tills implementation finns.
