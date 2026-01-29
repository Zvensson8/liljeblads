

# Twin.so API-integration för Agent-åtgärder

## Översikt
Skapa ett säkert API-endpoint som Twin.so kan anropa för att utföra åtgärder i systemet - skapa arbetsordrar, projekt, todos och mer.

---

## Arkitektur

```text
┌──────────────────┐        ┌───────────────────────┐        ┌──────────────────┐
│    Twin.so       │  POST  │  twin-webhook         │        │   Databasen      │
│    AI Agent      │───────→│  (Edge Function)      │───────→│   work_orders    │
│                  │        │  /w API-nyckel auth   │        │   projects       │
└──────────────────┘        └───────────────────────┘        │   property_todos │
                                     │                        └──────────────────┘
                                     │
                                     ▼
                            ┌───────────────────────┐
                            │  ai_suggested_actions │
                            │  (loggning)           │
                            └───────────────────────┘
```

---

## Steg 1: Databastabell för API-nycklar

Skapa en tabell för att hantera API-nycklar per organisation:

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) NOT NULL,
  key_hash TEXT NOT NULL,  -- SHA-256 hash av nyckeln
  name TEXT NOT NULL,       -- "Twin.so Integration"
  permissions JSONB DEFAULT '["create_work_order", "create_todo", "create_project"]',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- Endast en unik nyckel per hash
CREATE UNIQUE INDEX api_keys_key_hash_idx ON api_keys(key_hash);

-- RLS: endast organisationsadmins kan hantera nycklar
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins manage API keys"
ON api_keys FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid() 
    AND p.organization_id = api_keys.organization_id
    AND p.role IN ('admin', 'founder')
  )
);
```

---

## Steg 2: Edge Function `twin-webhook`

En publik edge function som Twin.so kan anropa:

```typescript
// supabase/functions/twin-webhook/index.ts

// POST /twin-webhook
// Headers: X-API-Key: <api-nyckel>
// Body: { action: "create_work_order", data: {...} }

// Stöder:
// - create_work_order
// - create_todo  
// - create_project
// - update_work_order_status
// - get_pending_actions (hämta AI-förslag som väntar)
// - execute_action (godkänn ett AI-förslag)
```

### Request-format

```json
{
  "action": "create_work_order",
  "data": {
    "property_name": "Fastighet ABC",
    "title": "Byt filter i ventilation",
    "priority": "high",
    "due_date": "2026-02-15",
    "comments": "Skapat via Twin.so"
  }
}
```

### Response-format

```json
{
  "success": true,
  "result": {
    "id": "uuid-of-created-item",
    "type": "work_order"
  }
}
```

---

## Steg 3: Stödda åtgärder

| Action                     | Beskrivning                                    |
|----------------------------|------------------------------------------------|
| `create_work_order`        | Skapa arbetsorder (kräver property_id/name)    |
| `create_todo`              | Skapa todo (kräver property_id/name)           |
| `create_project`           | Skapa projekt (kräver property_id/name)        |
| `update_work_order_status` | Uppdatera status på arbetsorder                |
| `get_pending_actions`      | Hämta alla väntande AI-förslag                 |
| `execute_action`           | Godkänn och utför ett AI-förslag               |
| `list_properties`          | Lista organisationens fastigheter              |
| `list_components`          | Lista komponenter (filtrera per fastighet)     |

---

## Steg 4: UI för API-nyckelhantering

Lägg till under **Inställningar → Organisation → Integrationer**:

```text
┌─────────────────────────────────────────────────────────────┐
│  API-integrationer                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔑 Twin.so Integration                                     │
│     Skapad: 2026-01-20  |  Senast använd: 2026-01-28       │
│     Behörigheter: Arbetsordrar, Todos, Projekt              │
│     [Visa nyckel] [Återkalla]                               │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  [+ Skapa ny API-nyckel]                                    │
│                                                             │
│  Endpoint URL:                                              │
│  https://vfwxpbffadedpvhdxntm.supabase.co/functions/v1/twin-webhook │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Steg 5: Loggning och spårbarhet

Alla anrop loggas i `ai_suggested_actions` med:
- `source_document_type = 'twin_webhook'`
- `status = 'executed'` (direkt utförd utan godkännande)
- Full spårbarhet av vad som skapades

---

## Säkerhet

1. **API-nyckel hashing**: Nycklar lagras som SHA-256 hash
2. **Rate limiting**: Max 100 anrop/minut per nyckel
3. **Permissions**: Granulär behörighetskontroll per nyckel
4. **Audit log**: Alla anrop loggas
5. **Expiration**: Valfri utgångstid på nycklar
6. **Organization scoping**: Nycklar kan bara påverka egen organisation

---

## Implementeringsordning

1. Skapa `api_keys`-tabell med RLS
2. Skapa `twin-webhook` edge function
3. Skapa UI för att generera/hantera nycklar
4. Dokumentera API:et för Twin.so-konfiguration

---

## Teknisk konfiguration för Twin.so

När du konfigurerar Twin.so, använd:

- **Webhook URL**: `https://vfwxpbffadedpvhdxntm.supabase.co/functions/v1/twin-webhook`
- **Method**: `POST`
- **Header**: `X-API-Key: <din-genererade-nyckel>`
- **Content-Type**: `application/json`

