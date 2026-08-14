# Jarvis i telefonen

Två vägar — båda pratar med **samma Liljeblads-data** (org-isolerat).

| | Ikon på hemskärmen | Ring ett nummer |
|--|--|--|
| Var | Er app (`/prata`) | xAI Voice Agent Builder |
| Vem | Inloggad användare | Den som har numret |
| Verktyg | Grok Voice + JWT | MCP + `lbl_`-nyckel |
| Ni gör | Lägg till på hemskärmen | Skapa agent + nummer i xAI |

---

## 1. Ikon på telefonen (redan i appen)

1. Öppna `https://liljeblads.vercel.app/prata` (inloggad).
2. **iPhone:** Dela → **Lägg till på hemskärmen**.
3. **Android:** meny → **Installera app** / Lägg till på startskärmen.
4. Tryck ikonen → prata med Ara.

Det är samma Grok Voice Agent som i chatten, bara helskärm.

---

## 2. Telefonnummer (xAI-konsolen)

Ni kan **inte** peka agenten på sajten. Den ska anropa MCP:

```
https://ojiswgqntenvbwtopxbu.supabase.co/functions/v1/jarvis-mcp
```

### A. Skapa API-nyckel i Liljeblads

Organisation → API-nycklar → ny nyckel, t.ex. namn **Jarvis telefon**.  
Spara `lbl_…` (visas bara en gång).

### B. Skapa voice-agent

1. Öppna https://console.x.ai/voice/agents
2. Ny agent, röst **Ara**, språk svenska.
3. Instruktion: *Du är Jarvis på Liljeblads. Kort som en kollega. Arkivera/status utan att fråga om lov.*
4. **Tools → Custom MCP**
   - URL: adressen ovan
   - Authorization: `Bearer lbl_DIN_NYCKEL`
5. Spara och testa i playground.

### C. Nummer

I samma agent: **Phone / Telephony**.

- xAI kan ge ett nummer, eller
- koppla eget via **SIP** (t.ex. Twilio).

När någon ringer numret kör Grok Voice verktygen mot er org (fastigheter, WO, projekt, arkivera…).

**Kostnad:** Grok Voice ~$0.05–0.08/min + ev. telefoni. Sätt spending limit i xAI.

---

## Verktyg via MCP

Samma slimmade set som röst i appen: lista fastigheter/projekt/WO, översikt, högrisk, todos, skapa WO/todo, ändra status, arkivera, ångra.

Permanent radering finns inte.

---

## Felsök MCP

```powershell
curl -s https://ojiswgqntenvbwtopxbu.supabase.co/functions/v1/jarvis-mcp `
  -H "Authorization: Bearer lbl_DIN_NYCKEL" `
  -H "Content-Type: application/json" `
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Ska returnera en `tools`-lista. `401` = fel nyckel.
