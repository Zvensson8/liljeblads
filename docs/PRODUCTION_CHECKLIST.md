# Liljeblads – produktionschecklista

## Klart i kodbasen

- [x] Validerad `.env` vid boot (`src/lib/env.ts`)
- [x] Fristående stack: Vite + Supabase + Gemini (inga tredjeparts AI-gateways)
- [x] Roll-guards: founder/admin på känsliga rutter
- [x] Modulåtkomst fail-closed
- [x] Cron edge functions kräver `CRON_SECRET`
- [x] Session-hantering uppdaterar access_token vid refresh
- [x] Error boundaries använder `import.meta.env.DEV`
- [x] Branding Liljeblads (index.html, PWA-manifest, Auth)

## Du måste göra i Supabase Dashboard

1. **Auth → URL configuration**
   - Site URL: produktions-URL (t.ex. `https://app.dindoman.se`)
   - Redirect URLs: `http://localhost:8080/**` + prod-URL `/**`

2. **Secrets** (`npx supabase secrets set ...`)
   ```text
   CRON_SECRET=<minst-32-slumpmässiga-tecken>
   XAI_API_KEY=xai-...            # Grok chat (rekommenderat)
   LLM_PROVIDER=xai
   XAI_MODEL=grok-4.3             # kostnadseffektiv; undvik 4.6 om budget
   LLM_MAX_TOKENS=2048            # valfritt tak
   GOOGLE_AI_API_KEY=...          # valfritt Gemini fallback / embeddings
   RESEND_API_KEY=...             # e-post (om används)
   ```

3. **Deploy edge functions**
   ```powershell
   npx supabase functions deploy
   ```

4. **Cron-jobb**  
   Uppdatera `pg_cron` / Dashboard cron att skicka:
   ```http
   x-cron-secret: <samma som CRON_SECRET>
   ```
   till t.ex. `.../functions/v1/check-and-send-reminders`

5. **Första admin**
   ```sql
   UPDATE public.profiles SET approved = true WHERE email = 'din@epost.se';
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'founder'::app_role FROM public.profiles WHERE email = 'din@epost.se'
   ON CONFLICT DO NOTHING;
   ```

6. **Storage buckets** – verifiera RLS och att buckets finns.

7. **Rotera access tokens** som delats i chatt/loggar.

## Bygg & deploy frontend

```powershell
cd C:\Users\andre\Documents\liljeblads
npm ci
npm run build
# servera dist/ via Cloudflare Pages / Netlify / S3+CDN / nginx
```

Sätt samma `VITE_SUPABASE_*` i hostens env vid build-tid (Vite bakes in values).

## Kvar / medvetna begränsningar

- Schemalagda rapporter genererar inte PDF/XLSX ännu (markerat / skyddat).
- AI-funktioner kräver externa API-nycklar.
- `react-leaflet@5` kräver `--legacy-peer-deps` (React 18).
- Byt ut `placeholder.svg` mot riktiga PWA-ikoner innan app-store / strikt Lighthouse.
