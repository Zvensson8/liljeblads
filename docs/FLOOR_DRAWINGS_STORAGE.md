# Floor drawings storage

Bucket: **`floor-drawings`** (privat).

## Sökväg

```text
{user_id}/{floor_id}/{timestamp}.{ext}
```

`floors.drawing_url` ska vara **sökvägen** (inte public URL).

## Laddning i appen

`resolveFloorDrawingUrl`:

1. Authenticated `download` → blob URL  
2. Annars `createSignedUrl`  
3. Tydligt fel om RLS/fil saknas  

## Migration

Kör i Supabase SQL Editor om ritningar inte laddas:

`supabase/migrations/20260727210000_floor_drawings_storage_rls.sql`

Den ger org-medlemmar SELECT/INSERT/UPDATE/DELETE baserat på våning → fastighet → organisation.

## Symptom

```text
Kunde inte hämta ritning från storage (...): {}
```

= nästan alltid **RLS nekar** eller filen saknas. Kör migrationen ovan, sedan **ladda upp ritningen igen** om filen är borta.
