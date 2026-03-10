import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Circuit breaker (per-instance)
const cb = { failures: 0, lastFailure: 0, isOpen: false, threshold: 5, resetMs: 60000 };

function checkCircuitBreaker() {
  if (cb.isOpen) {
    if (Date.now() - cb.lastFailure > cb.resetMs) {
      cb.isOpen = false; cb.failures = 0;
    } else {
      throw new Error('AI-tjänsten är tillfälligt otillgänglig. Försök igen om en stund.');
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────
function extractSearchTerms(message: string): string[] {
  const stopWords = new Set([
    'berätta','om','vad','är','hur','kan','du','jag','vi','det','den','de',
    'ett','en','och','eller','för','med','på','i','av','till','från',
    'finns','har','hade','vara','bli','får','ska','vill','måste',
    'visa','ge','mig','information','data','uppgifter','detaljer',
    'alla','allt','vilka','vilken','vilket','denna','detta','dessa',
    'min','mitt','mina','din','ditt','dina','sin','sitt','sina',
    'vår','vårt','våra','er','ert','era','deras',
    'när','var','vart','varför','mycket',
  ]);
  const words = message.toLowerCase().replace(/[.,!?;:'"()[\]{}]/g, ' ')
    .split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));
  const propertyNames = message.match(/([A-ZÅÄÖ][a-zåäö]+\s*\d+)/gi);
  if (propertyNames) words.push(...propertyNames.map(m => m.trim()));
  const quoted = message.match(/"([^"]+)"/g);
  if (quoted) words.push(...quoted.map(m => m.replace(/"/g, '').trim()));
  const yearRe = /^20[2-3]\d$/;
  return [...new Set(words)].filter(w => !yearRe.test(w));
}

function parseTimeFilter(message: string): { quarter?: number; year?: number } {
  const f: { quarter?: number; year?: number } = {};
  const qm = message.match(/(?:q|kvartal\s*)([1-4])/i);
  if (qm) f.quarter = parseInt(qm[1]);
  const ym = message.match(/\b(20[2-3]\d)\b/);
  if (ym) f.year = parseInt(ym[1]);
  return f;
}

// ── Context builder ──────────────────────────────────────────
async function buildContext(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userMessage: string,
): Promise<string> {
  const searchTerms = extractSearchTerms(userMessage);
  const timeFilter = parseTimeFilter(userMessage);
  const parts: string[] = [];

  // 1. Org overview with properties & components
  const { data: props } = await supabase
    .from('properties')
    .select('id, name, address, property_number, area_sqm, type, year_built')
    .eq('organization_id', orgId);
  const propIds = props?.map(p => p.id) || [];
  const propMap = new Map(props?.map(p => [p.id, p.name]) || []);

  let comps: any[] = [];
  if (propIds.length > 0) {
    const { data } = await supabase
      .from('components')
      .select('id, name, property_id, type, status, manufacturer, model, installation_year, next_service_date')
      .in('property_id', propIds);
    comps = data || [];
  }
  const compIds = comps.map(c => c.id);

  if (props && props.length > 0) {
    let ov = `🏢 ORGANISATIONSÖVERSIKT:\n  Fastigheter: ${props.length}, Komponenter: ${compIds.length}`;
    for (const p of props) {
      ov += `\n\n  📍 ${p.name}`;
      if (p.address) ov += ` — ${p.address}`;
      if (p.property_number) ov += ` (${p.property_number})`;
      if (p.area_sqm) ov += `\n    Yta: ${p.area_sqm} m²`;
      if (p.year_built) ov += `, Byggår: ${p.year_built}`;
      const pc = comps.filter(c => c.property_id === p.id);
      if (pc.length > 0) {
        ov += `\n    Komponenter (${pc.length}):`;
        for (const c of pc.slice(0, 15)) {
          ov += `\n      - ${c.name} (${c.type || '?'})`;
          if (c.status && c.status !== 'active') ov += ` [${c.status}]`;
          if (c.next_service_date) ov += ` — nästa service: ${c.next_service_date}`;
        }
        if (pc.length > 15) ov += `\n      ... och ${pc.length - 15} fler`;
      }
    }
    parts.push(ov);
  }

  if (propIds.length === 0) return '';

  // 2. Maintenance history
  if (compIds.length > 0) {
    let mq = supabase.from('maintenance_history')
      .select('*, component:components(name, property_id, property:properties(name)), documents:maintenance_history_documents(id, file_name, file_url)')
      .in('component_id', compIds).order('performed_date', { ascending: false });
    if (timeFilter.year) {
      mq = mq.gte('performed_date', `${timeFilter.year}-01-01`).lte('performed_date', `${timeFilter.year}-12-31`);
    }
    const { data: mhRecords } = await mq.limit(50);
    if (mhRecords && mhRecords.length > 0) {
      // Fetch document embeddings for protocol content
      const docIds = mhRecords.flatMap(m => (m.documents || []).map((d: any) => d.id)).filter(Boolean);
      let docEmbeddings: any[] = [];
      if (docIds.length > 0) {
        const { data } = await supabase.from('embeddings').select('source_id, content')
          .eq('source_table', 'maintenance_history_documents').in('source_id', docIds);
        docEmbeddings = data || [];
      }

      let filtered = mhRecords;
      if (searchTerms.length > 0) {
        const f = mhRecords.filter(m => {
          const t = `${m.action_type||''} ${m.notes||''} ${m.category||''} ${m.supplier||''} ${m.component?.name||''}`.toLowerCase();
          return searchTerms.some(s => t.includes(s.toLowerCase()));
        });
        if (f.length > 0) filtered = f;
      }

      const byProp = new Map<string, any[]>();
      for (const m of filtered.slice(0, 30)) {
        const pid = m.component?.property_id;
        if (pid) { if (!byProp.has(pid)) byProp.set(pid, []); byProp.get(pid)!.push(m); }
      }
      for (const [pid, records] of byProp) {
        let info = `🔧 UNDERHÅLLSHISTORIK FÖR ${(propMap.get(pid) || '?').toUpperCase()}${timeFilter.year ? ` (${timeFilter.year})` : ''}:`;
        let total = 0;
        for (const m of records) {
          info += `\n\n  ${m.performed_date}: ${m.action_type}`;
          info += `\n    Komponent: ${m.component?.name || '?'}`;
          if (m.category) info += `\n    Kategori: ${m.category}`;
          if (m.cost) { info += `\n    Kostnad: ${m.cost.toLocaleString('sv-SE')} kr`; total += m.cost; }
          if (m.supplier) info += `\n    Leverantör: ${m.supplier}`;
          if (m.is_warranty) info += ` (Garanti)`;
          if (m.notes) info += `\n    Anteckningar: ${m.notes}`;
          if (m.documents?.length > 0) {
            info += `\n    📄 Dokument:`;
            for (const d of m.documents) {
              info += `\n      - ${d.file_name}`;
              const emb = docEmbeddings.find(e => e.source_id === d.id);
              if (emb?.content) {
                const match = emb.content.match(/(?:DOKUMENTINNEHÅLL|PROTOKOLLINNEHÅLL|=== PROTOKOLLINNEHÅLL)[\s:=]*\n?([\s\S]+)/i);
                const content = match?.[1]?.trim().substring(0, 2500) || (emb.content.length > 200 ? emb.content.substring(200).trim().substring(0, 2000) : '');
                if (content) info += `\n        📋 ${content.replace(/\n/g, '\n        ')}`;
              }
            }
          }
        }
        if (records.length > 1) info += `\n\n  TOTALT: ${total.toLocaleString('sv-SE')} kr för ${records.length} åtgärder`;
        parts.push(info);
      }
    }
  }

  // 3. Work orders
  {
    let wq = supabase.from('work_orders').select('*, property:properties(name)')
      .in('property_id', propIds).order('created_at', { ascending: false });
    if (timeFilter.year) {
      wq = wq.or(`due_date.gte.${timeFilter.year}-01-01,created_at.gte.${timeFilter.year}-01-01`);
    }
    const { data: wos } = await wq.limit(50);
    if (wos && wos.length > 0) {
      let filtered = wos;
      if (searchTerms.length > 0) {
        const f = wos.filter(w => {
          const t = `${w.action||''} ${w.comments||''} ${w.contractor||''} ${w.property?.name||''}`.toLowerCase();
          return searchTerms.some(s => t.includes(s.toLowerCase()));
        });
        if (f.length > 0) filtered = f;
      }
      const show = filtered.length > 0 ? filtered : (timeFilter.year ? wos.slice(0, 20) : []);
      if (show.length > 0) {
        const sl = (s: string) => ({ not_started: 'Ej påbörjad', awaiting_quote: 'Väntar på offert', ordered: 'Beställd', completed: 'Avslutad', archived: 'Arkiverad' }[s] || s);
        const byProp = new Map<string, any[]>();
        for (const w of show) { const p = w.property_id; if (!byProp.has(p)) byProp.set(p, []); byProp.get(p)!.push(w); }
        for (const [pid, orders] of byProp) {
          let info = `🛠️ ARBETSORDRAR FÖR ${(propMap.get(pid) || '?').toUpperCase()}${timeFilter.year ? ` (${timeFilter.year})` : ''}:`;
          let tp = 0;
          for (const w of orders) {
            info += `\n\n  ${w.action}\n    Status: ${sl(w.status)}`;
            if (w.priority) info += `, Prioritet: ${w.priority}`;
            if (w.contractor) info += `\n    Entreprenör: ${w.contractor}`;
            if (w.due_date) info += `\n    Deadline: ${w.due_date}`;
            if (w.price) { info += `\n    Pris: ${w.price.toLocaleString('sv-SE')} kr`; tp += w.price; }
            if (w.comments) info += `\n    Kommentar: ${w.comments}`;
          }
          if (orders.length > 1 && tp > 0) info += `\n\n  TOTALT: ${tp.toLocaleString('sv-SE')} kr`;
          parts.push(info);
        }
      }
    }
  }

  // 4. Projects by time
  if ((timeFilter.quarter || timeFilter.year)) {
    let q = supabase.from('projects').select('*, property:properties(name)').in('property_id', propIds);
    if (timeFilter.quarter) q = q.eq('start_quarter', timeFilter.quarter);
    if (timeFilter.year) q = q.eq('year', timeFilter.year);
    const { data: projects } = await q.limit(30);
    if (projects && projects.length > 0) {
      for (const pr of projects) {
        let info = `📋 PROJEKT: ${pr.name} (${pr.property?.name || '?'})`;
        info += `\n    Status: ${pr.status || '?'}, Typ: ${pr.type || '?'}`;
        if (pr.budget) info += `\n    Budget: ${pr.budget.toLocaleString('sv-SE')} kr`;
        if (pr.actual_cost) info += `, Utfall: ${pr.actual_cost.toLocaleString('sv-SE')} kr`;
        if (pr.description) info += `\n    ${pr.description}`;
        parts.push(info);
      }
    }
  }

  // 5. Drift tasks by time
  if ((timeFilter.quarter || timeFilter.year)) {
    let q = supabase.from('drift_tasks').select('*, property:properties(name), category:drift_categories(name)').in('property_id', propIds);
    if (timeFilter.quarter) q = q.eq('quarter', timeFilter.quarter);
    if (timeFilter.year) q = q.eq('year', timeFilter.year);
    const { data: tasks } = await q.limit(100);
    if (tasks && tasks.length > 0) {
      const byProp = new Map<string, any[]>();
      for (const t of tasks) { const p = t.property_id; if (!byProp.has(p)) byProp.set(p, []); byProp.get(p)!.push(t); }
      for (const [pid, pt] of byProp) {
        const done = pt.filter(t => (t.reported_count||0) >= (t.planned_count||0));
        const missing = pt.filter(t => (t.reported_count||0) === 0);
        let info = `📊 DRIFTUPPGIFTER FÖR ${(propMap.get(pid)||'?').toUpperCase()} (${timeFilter.quarter?'Q'+timeFilter.quarter:''} ${timeFilter.year||''}):`;
        info += `\n  Totalt: ${pt.length}, ✅ Klara: ${done.length}, ❌ Ej utförda: ${missing.length}`;
        if (missing.length > 0 && missing.length <= 10) {
          info += `\n  Ej utförda:`;
          for (const t of missing) info += `\n    - ${t.name}${t.category?.name ? ` (${t.category.name})` : ''}`;
        }
        parts.push(info);
      }
    }
  }

  // 6. Contacts (keyword-triggered)
  if (searchTerms.some(t => ['kontakt','kontakter','telefon','email','ansvarig','leverantör','entreprenör','firma','ring','person'].includes(t.toLowerCase()))) {
    const { data: contacts } = await supabase.from('property_contacts').select('*, property:properties(name)').in('property_id', propIds).limit(50);
    if (contacts && contacts.length > 0) {
      let info = `👤 KONTAKTER:`;
      for (const c of contacts) {
        info += `\n  ${c.name}`;
        if (c.role) info += ` - ${c.role}`;
        if (c.company) info += ` (${c.company})`;
        if (c.phone) info += ` 📞 ${c.phone}`;
        if (c.email) info += ` ✉️ ${c.email}`;
        info += ` [${c.property?.name || '?'}]`;
      }
      parts.push(info);
    }
  }

  // 7. Recurring costs (keyword-triggered)
  if (searchTerms.some(t => ['kostnad','kostnader','löpande','avtal','faktura','budget','pris','hyra','el','vatten','värme','försäkring','driftskostnad'].includes(t.toLowerCase()))) {
    const { data: costs } = await supabase.from('recurring_costs').select('*, property:properties(name)').in('property_id', propIds).limit(50);
    if (costs && costs.length > 0) {
      const byProp = new Map<string, any[]>();
      for (const c of costs) { const p = c.property_id; if (!byProp.has(p)) byProp.set(p, []); byProp.get(p)!.push(c); }
      for (const [pid, pc] of byProp) {
        let info = `💰 LÖPANDE KOSTNADER FÖR ${(propMap.get(pid)||'?').toUpperCase()}:`;
        let monthly = 0;
        for (const c of pc) {
          info += `\n  ${c.description}`;
          if (c.contractor_name) info += ` (${c.contractor_name})`;
          info += ` — ${c.amount?.toLocaleString('sv-SE')} kr/${c.payment_interval || 'månad'}`;
          const iv = c.payment_interval || 'monthly';
          if (iv === 'monthly') monthly += c.amount || 0;
          else if (iv === 'quarterly') monthly += (c.amount || 0) / 3;
          else if (iv === 'yearly') monthly += (c.amount || 0) / 12;
        }
        info += `\n  TOTALT: ~${Math.round(monthly).toLocaleString('sv-SE')} kr/mån`;
        parts.push(info);
      }
    }
  }

  // 8. Todos (keyword-triggered)
  if (searchTerms.some(t => ['todo','todos','göra','uppgift','uppgifter','checklist','påminnelse','deadline','förfaller','planerat','agenda'].includes(t.toLowerCase()))) {
    const { data: todos } = await supabase.from('property_todos').select('*, property:properties(name)')
      .in('property_id', propIds).eq('completed', false).order('due_date', { ascending: true }).limit(30);
    if (todos && todos.length > 0) {
      let info = `✅ ATT GÖRA:`;
      for (const t of todos) {
        info += `\n  - ${t.title}`;
        if (t.priority) info += ` [${t.priority}]`;
        if (t.due_date) info += ` deadline: ${t.due_date}`;
        info += ` (${t.property?.name || '?'})`;
      }
      parts.push(info);
    }
  }

  // 9. Recent activity (always)
  {
    const { data: recentWo } = await supabase.from('work_orders').select('id, action, status, priority, created_at, property:properties(name)')
      .in('property_id', propIds).gte('created_at', new Date(Date.now() - 30*86400000).toISOString())
      .order('created_at', { ascending: false }).limit(10);
    if (recentWo && recentWo.length > 0) {
      let info = `🕐 SENASTE ARBETSORDRAR (30 dagar):`;
      for (const w of recentWo) info += `\n  - ${w.action} (${w.property?.name || '?'}) — ${w.status}`;
      parts.push(info);
    }
    const { data: upTodos } = await supabase.from('property_todos').select('id, title, due_date, priority, property:properties(name)')
      .in('property_id', propIds).eq('completed', false).order('due_date', { ascending: true }).limit(10);
    if (upTodos && upTodos.length > 0) {
      let info = `⏰ KOMMANDE ATT-GÖRA:`;
      for (const t of upTodos) {
        info += `\n  - ${t.title} (${t.property?.name || '?'})`;
        if (t.due_date) info += ` — deadline: ${t.due_date}`;
      }
      parts.push(info);
    }
    const { data: activeProj } = await supabase.from('projects').select('id, name, status, budget, actual_cost, property:properties(name)')
      .in('property_id', propIds).in('status', ['pagaende', 'planerat']).limit(10);
    if (activeProj && activeProj.length > 0) {
      let info = `🚧 AKTIVA/PLANERADE PROJEKT:`;
      for (const p of activeProj) {
        info += `\n  - ${p.name} (${p.property?.name || '?'}) — ${p.status}`;
        if (p.budget) info += `, budget: ${p.budget.toLocaleString('sv-SE')} kr`;
      }
      parts.push(info);
    }
  }

  if (parts.length === 0) return '';
  return `\n\n--- RELEVANT DATA FRÅN SYSTEMET ---\n${parts.join('\n\n')}\n--- SLUT PÅ DATA ---`;
}

// ── Action tools definition ──────────────────────────────────
const actionTools = [
  {
    type: "function",
    function: {
      name: "suggest_work_order",
      description: "Föreslå att skapa en arbetsorder baserat på konversationen.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Beskrivning av åtgärden" },
          property_name: { type: "string", description: "Fastighetens namn" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          reasoning: { type: "string", description: "Kort förklaring på svenska" },
          confidence: { type: "number", description: "Säkerhet 0.0-1.0" }
        },
        required: ["action", "reasoning", "confidence"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "suggest_todo",
      description: "Föreslå att skapa en att-göra-uppgift.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          property_name: { type: "string" },
          due_date: { type: "string", description: "YYYY-MM-DD" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          reasoning: { type: "string" },
          confidence: { type: "number" }
        },
        required: ["title", "reasoning", "confidence"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "suggest_maintenance",
      description: "Föreslå att schemalägga underhåll för en komponent.",
      parameters: {
        type: "object",
        properties: {
          component_name: { type: "string" },
          maintenance_type: { type: "string" },
          suggested_date: { type: "string", description: "YYYY-MM-DD" },
          reasoning: { type: "string" },
          confidence: { type: "number" }
        },
        required: ["maintenance_type", "reasoning", "confidence"]
      }
    }
  }
];

const systemPromptBase = `Du är en expert AI-assistent för fastighetsförvaltning. Du har tillgång till organisationens alla data.

VIKTIGA REGLER:
1. Svara ALLTID på svenska
2. Var KONKRET och SPECIFIK — referera till faktisk data, namn, siffror och datum
3. Presentera data strukturerat. Generiska svar utan datagrund är oacceptabla.
4. Om serviceprotokoll finns, lyft fram mätvärden, avvikelser och rekommendationer
5. Skillnad: DRIFTUPPGIFTER (kvartalsvis underhåll) vs ATT GÖRA (todos med deadline)
6. Om information saknas, säg EXAKT vilken data som saknas
7. Ge alltid siffror (antal, kronor, procent) vid översikter
8. Använd verktygen för att föreslå åtgärder (confidence >= 0.7)

SVARSFORMAT:
📊 SAMMANFATTNING — Översikt
🔍 MÄTVÄRDEN — Specifika mätvärden
⚠️ AVVIKELSER & REKOMMENDATIONER — Problem och förslag`;

// ── Main handler ─────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    checkCircuitBreaker();

    const { messages, stream: streamRequested, conversationId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    if (!LOVABLE_API_KEY) {
      return jsonResponse({ error: 'AI är inte konfigurerad' }, 500);
    }

    // ── Auth ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Authorization header required' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);

    if (userError || !userData?.user?.id) {
      return jsonResponse({ error: 'Session expired. Please log in again.' }, 401);
    }

    const userId = userData.user.id;

    // ── Rate limit ──
    const rateResult = await checkRateLimit(userId, { endpoint: 'ai-chat', maxRequests: 20, windowSeconds: 60 });
    const rateLimited = rateLimitResponse(rateResult, corsHeaders);
    if (rateLimited) return rateLimited;

    // ── Profile & org ──
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', userId).single();
    if (!profile?.organization_id) {
      return jsonResponse({ error: 'User profile not found' }, 403);
    }
    const orgId = profile.organization_id;

    // ── Build context ──
    const lastUserMsg = messages.filter((m: any) => m.role === 'user').pop();
    let contextInfo = '';
    if (lastUserMsg?.content) {
      try {
        contextInfo = await buildContext(supabase, orgId, lastUserMsg.content);
        console.log(`Context built (${contextInfo.length} chars)`);
      } catch (e) {
        console.error('Context build error:', e);
      }
    }

    const systemPrompt = systemPromptBase + contextInfo;
    const useTools = !streamRequested;

    // ── AI request ──
    const requestBody: any = {
      model: 'google/gemini-2.5-flash',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      stream: streamRequested || false,
    };
    if (useTools) {
      requestBody.tools = actionTools;
      requestBody.tool_choice = "auto";
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errText);
      cb.failures++; cb.lastFailure = Date.now();
      if (cb.failures >= cb.threshold) cb.isOpen = true;

      if (aiResponse.status === 429) return jsonResponse({ error: 'För många förfrågningar. Försök igen om en stund.' }, 429);
      if (aiResponse.status === 402) return jsonResponse({ error: 'Krediter slut.' }, 402);
      return jsonResponse({ error: `AI-fel: ${aiResponse.status}` }, 502);
    }

    // Reset circuit breaker on success
    cb.failures = 0; cb.isOpen = false;

    // ── Streaming ──
    if (streamRequested && aiResponse.body) {
      return new Response(aiResponse.body, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
      });
    }

    // ── Non-streaming ──
    const data = await aiResponse.json();
    const choice = data.choices?.[0];
    const message = choice?.message?.content || '';
    const toolCalls = choice?.message?.tool_calls || [];

    // Process tool calls
    const suggestedActions: any[] = [];
    if (toolCalls.length > 0 && conversationId) {
      const actionMap: Record<string, string> = {
        suggest_work_order: 'create_work_order',
        suggest_todo: 'create_todo',
        suggest_maintenance: 'schedule_maintenance',
      };
      for (const tc of toolCalls) {
        try {
          const args = JSON.parse(tc.function.arguments);
          if (args.confidence >= 0.5) {
            const { data: inserted } = await supabase.from('ai_suggested_actions').insert({
              organization_id: orgId,
              conversation_id: conversationId,
              action_type: actionMap[tc.function.name] || tc.function.name,
              payload: args,
              confidence_score: args.confidence,
              reasoning: args.reasoning,
            }).select().single();
            if (inserted) suggestedActions.push({ id: inserted.id, type: actionMap[tc.function.name], ...args });
          }
        } catch (e) { console.error('Tool call parse error:', e); }
      }
    }

    return jsonResponse({
      message: message || 'Jag förstår. Finns det något mer jag kan hjälpa till med?',
      suggestedActions,
    });

  } catch (error: unknown) {
    console.error('ai-chat error:', error);
    cb.failures++; cb.lastFailure = Date.now();
    if (cb.failures >= cb.threshold) cb.isOpen = true;

    const msg = error instanceof Error ? error.message : 'Unknown error';
    if (msg.includes('tillfälligt otillgänglig')) return jsonResponse({ error: msg }, 503);
    return jsonResponse({ error: msg }, 500);
  }
});
