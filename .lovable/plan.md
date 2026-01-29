
# Plan: Lägg till JWT-autentisering i twin-webhook

## Bakgrund
Twin.so förväntar sig att kunna använda standard Supabase JWT-tokens (som börjar med `eyJ`), men den nuvarande `twin-webhook` edge function stöder endast egna API-nycklar (som börjar med `lbl_`). 

## Lösning
Utöka edge function till att stödja **två autentiseringsmetoder**:
1. **API-nyckel** via `X-API-Key` header (befintligt) - för externa integrationer med behörighetskontroll
2. **JWT-token** via `Authorization: Bearer` header (ny) - för autentiserade användare

## Tekniska detaljer

### Autentiseringsflöde (uppdaterat)
```text
┌─────────────────────────────────────────────────────────────┐
│                    INKOMMANDE REQUEST                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Finns X-API-Key header?                        │
├──────────────────────────┬──────────────────────────────────┤
│           JA             │             NEJ                  │
│    ▼                     │              ▼                   │
│ Validera lbl_nyckel      │    Finns Authorization header?   │
│ mot api_keys-tabellen    │              │                   │
│    ▼                     │    ┌─────────┴─────────┐         │
│ Hämta org_id från        │   JA                 NEJ         │
│ api_keys                 │    ▼                  ▼          │
│    ▼                     │ Validera JWT     401 Unauthorized│
│ Kolla permissions        │ via getUser()                    │
│                          │    ▼                             │
│                          │ Hämta org_id                     │
│                          │ från profiles                    │
│                          │    ▼                             │
│                          │ ALLA permissions                 │
│                          │ tillåtna                         │
└──────────────────────────┴──────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  UTFÖR ÅTGÄRD                               │
└─────────────────────────────────────────────────────────────┘
```

### Fil som ändras
| Fil | Ändring |
|-----|---------|
| `supabase/functions/twin-webhook/index.ts` | Lägg till JWT-validering som alternativ autentisering |

### Kodändringar

**1. Lägg till ny funktion för JWT-validering:**
```typescript
async function validateJwtToken(
  supabase: any,
  authHeader: string
): Promise<{ organizationId: string; userId: string } | null> {
  const token = authHeader.replace('Bearer ', '');
  
  // Verifiera JWT med getUser
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  
  if (userError || !userData?.user?.id) {
    console.error('JWT validation failed:', userError);
    return null;
  }
  
  // Hämta användarens organisation
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', userData.user.id)
    .single();
  
  if (profileError || !profile?.organization_id) {
    console.error('Profile lookup failed:', profileError);
    return null;
  }
  
  return {
    organizationId: profile.organization_id,
    userId: userData.user.id
  };
}
```

**2. Uppdatera huvudflödet:**
```typescript
// Försök med X-API-Key först
const apiKey = req.headers.get("x-api-key");
const authHeader = req.headers.get("authorization");

let organizationId: string;
let authMethod: "api_key" | "jwt";
let skipPermissionCheck = false;

if (apiKey) {
  // Befintlig API-nyckel-validering
  const apiKeyData = await validateApiKey(supabase, apiKey);
  if (!apiKeyData) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid or expired API key" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  organizationId = apiKeyData.organization_id;
  authMethod = "api_key";
  
  // Kolla permissions för API-nycklar
  if (!hasPermission(apiKeyData, action)) {
    return new Response(
      JSON.stringify({ success: false, error: `Permission denied: ${action}` }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
} else if (authHeader?.startsWith('Bearer ')) {
  // JWT-autentisering
  const jwtData = await validateJwtToken(supabase, authHeader);
  if (!jwtData) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid or expired token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  organizationId = jwtData.organizationId;
  authMethod = "jwt";
  skipPermissionCheck = true; // JWT-användare har alla rättigheter
} else {
  return new Response(
    JSON.stringify({ 
      success: false, 
      error: "Authentication required. Use X-API-Key header or Authorization: Bearer <jwt>" 
    }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

### Användning för Twin.so

Med denna ändring kan Twin.so konfigurera integrationen på två sätt:

**Alternativ 1: Med JWT (som Twin.so föredrar)**
```http
POST /functions/v1/twin-webhook
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "action": "list_properties"
}
```

**Alternativ 2: Med API-nyckel (ursprunglig metod)**
```http
POST /functions/v1/twin-webhook
X-API-Key: lbl_...
Content-Type: application/json

{
  "action": "list_properties"
}
```

### Säkerhetsöverväganden
- JWT-tokens valideras mot Supabase Auth
- Användaren måste ha en giltig profil med koppling till en organisation
- JWT-användare får full åtkomst (de är redan autentiserade användare)
- API-nycklar behåller sin granulära behörighetskontroll
- Loggning visar vilken autentiseringsmetod som användes
