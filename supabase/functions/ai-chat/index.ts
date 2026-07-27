import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import {
  chatCompletion,
  isLlmConfigured,
  type ChatMessage,
  type ChatCompletionResponse,
} from "../_shared/llmClient.ts";
import { executeJarvisTool, jarvisTools } from "../_shared/jarvisTools.ts";

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

function normalizeProjectReference(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

function extractProjectReferences(message: string): string[] {
  const matches = message.match(/\b\d{4,6}(?:[-+][A-Z0-9]+)?\b/gi) || [];
  return [...new Set(matches
    .map(normalizeProjectReference)
    .filter(ref => !/^20[2-3]\d$/.test(ref)))];
}

// ── Embedding helper ─────────────────────────────────────────
async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    }
  );
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Embedding API error ${resp.status}: ${errText}`);
  }
  const data = await resp.json();
  return data.embedding?.values || [];
}

// ── Context builder ──────────────────────────────────────────
async function buildContext(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userMessage: string,
): Promise<string> {
  const searchTerms = extractSearchTerms(userMessage);
  const timeFilter = parseTimeFilter(userMessage);
  const projectRefs = extractProjectReferences(userMessage);
  const parts: string[] = [];

  // 1. Org overview with properties & components
  const { data: props, error: propsError } = await supabase
    .from('properties')
    .select('id, name, address, property_number, area_sqm, property_type, construction_year')
    .eq('organization_id', orgId);
  
  if (propsError) console.error('Properties query error:', propsError.message);
  
  const propIds = props?.map(p => p.id) || [];
  const propMap = new Map(props?.map(p => [p.id, p.name]) || []);
  let explicitlyMatchedProjects: any[] = [];

  if (projectRefs.length > 0 && propIds.length > 0) {
    const { data: projectCandidates, error: projectCandidatesError } = await supabase
      .from('projects')
      .select('id, name, project_number, status, budget, actual_cost, description, type, year, start_quarter, property_id, property:properties(name, address)')
      .in('property_id', propIds)
      .limit(200);

    if (projectCandidatesError) {
      console.error('Project candidate query error:', projectCandidatesError.message);
    } else {
      explicitlyMatchedProjects = (projectCandidates || []).filter((project: any) =>
        projectRefs.includes(normalizeProjectReference(project.project_number || ''))
      );

      if (explicitlyMatchedProjects.length > 0) {
        let info = `🎯 EXAKT PROJEKTMATCHNING FÖR DENNA FRÅGA:`;
        for (const project of explicitlyMatchedProjects) {
          info += `\n  - ${project.name}`;
          if (project.project_number) info += ` [Projektnr: ${project.project_number}]`;
          info += ` (${project.property?.name || '?'})`;
          if (project.status) info += ` — ${project.status}`;
          if (project.type) info += `, typ: ${project.type}`;
          if (project.year) info += `, år: ${project.year}`;
          if (project.start_quarter) info += `, startkvartal: Q${project.start_quarter}`;
          if (project.budget) info += `\n    Budget: ${project.budget.toLocaleString('sv-SE')} kr`;
          if (project.actual_cost) info += `, Utfall: ${project.actual_cost.toLocaleString('sv-SE')} kr`;
          if (project.description) info += `\n    Beskrivning: ${project.description}`;
        }
        parts.push(info);
      } else {
        parts.push(`⚠️ Ingen exakt projektmatchning hittades för projektnummer: ${projectRefs.join(', ')}`);
      }
    }
  }

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
      if (p.construction_year) ov += `, Byggår: ${p.construction_year}`;
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
    let projects = explicitlyMatchedProjects;

    if (projects.length === 0) {
      let q = supabase.from('projects').select('*, property:properties(name, address)').in('property_id', propIds);
      if (timeFilter.quarter) q = q.eq('start_quarter', timeFilter.quarter);
      if (timeFilter.year) q = q.eq('year', timeFilter.year);
      const { data } = await q.limit(30);
      projects = data || [];
    }

    if (projects && projects.length > 0) {
      for (const pr of projects) {
        let info = `📋 PROJEKT: ${pr.name}`;
        if (pr.project_number) info += ` [Projektnr: ${pr.project_number}]`;
        info += ` (${pr.property?.name || '?'})`;
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
    const activeProj = explicitlyMatchedProjects.length > 0
      ? explicitlyMatchedProjects.filter((project: any) => ['pagaende', 'planerat'].includes(project.status))
      : (await supabase.from('projects').select('id, name, project_number, status, budget, actual_cost, description, property:properties(name)')
        .in('property_id', propIds).in('status', ['pagaende', 'planerat']).limit(10)).data;

    if (activeProj && activeProj.length > 0) {
      let info = `🚧 AKTIVA/PLANERADE PROJEKT:`;
      for (const p of activeProj) {
        info += `\n  - ${p.name}`;
        if (p.project_number) info += ` [Projektnr: ${p.project_number}]`;
        info += ` (${p.property?.name || '?'}) — ${p.status}`;
        if (p.budget) info += `, budget: ${p.budget.toLocaleString('sv-SE')} kr`;
      }
      parts.push(info);
    }
  }

  if (parts.length === 0) return '';
  return `\n\n--- RELEVANT DATA FRÅN SYSTEMET ---\n${parts.join('\n\n')}\n--- SLUT PÅ DATA ---`;
}

// ── Knowledge base RAG search ────────────────────────────────
async function searchKnowledgeBase(
  supabase: ReturnType<typeof createClient>,
  userMessage: string,
  googleApiKey: string,
): Promise<string> {
  try {
    if (userMessage.length < 3) return '';
    
    console.log('KB search: generating embedding...');
    const queryEmbedding = await getEmbedding(userMessage, googleApiKey);
    console.log(`KB search: embedding generated (${queryEmbedding.length} dims)`);
    
    const { data: kbChunks, error } = await supabase.rpc("match_knowledge_base_chunks", {
      _embedding: JSON.stringify(queryEmbedding),
      _match_count: 8,
      _match_threshold: 0.35,
    });

    if (error) {
      console.error('KB search RPC error:', error);
      return '';
    }
    console.log(`KB search: found ${kbChunks?.length || 0} chunks`);
    if (!kbChunks?.length) return '';

    const kbBySource = new Map<string, { title: string; chunks: string[] }>();
    for (const chunk of kbChunks) {
      if (!kbBySource.has(chunk.source_key)) {
        kbBySource.set(chunk.source_key, { title: chunk.source_title, chunks: [] });
      }
      kbBySource.get(chunk.source_key)!.chunks.push(chunk.content);
    }

    const parts: string[] = [];
    for (const [_key, info] of kbBySource) {
      parts.push(`## ${info.title}\n\n${info.chunks.join("\n\n---\n\n")}`);
    }

    let kbContext = parts.join("\n\n===\n\n");
    if (kbContext.length > 40000) {
      kbContext = kbContext.substring(0, 40000) + "\n\n[...trunkerad]";
    }

    return `\n\n--- KUNSKAPSBAS (BRANSCHSTANDARDER & LAGSTIFTNING) ---\n${kbContext}\n--- SLUT PÅ KUNSKAPSBAS ---`;
  } catch (e) {
    console.error("Knowledge base search error:", e);
    return '';
  }
}

// ── Property document RAG (Document Brain) ───────────────────
async function searchPropertyDocuments(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userMessage: string,
  googleApiKey: string,
): Promise<string> {
  try {
    if (userMessage.length < 3) return '';

    const queryEmbedding = await getEmbedding(userMessage, googleApiKey);
    const { data: hits, error } = await supabase.rpc('semantic_search_ranked', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.28,
      match_count: 8,
      org_id: orgId,
      filter_tables: ['property_documents'],
      boost_recent: true,
      boost_popular: false,
    });

    if (error) {
      console.error('Property doc search RPC error:', error);
      return '';
    }
    if (!hits?.length) {
      console.log('Property doc search: 0 hits');
      return '';
    }

    console.log(`Property doc search: ${hits.length} hits`);
    const lines = hits.map((h: {
      content?: string;
      similarity?: number;
      source_id?: string;
    }, i: number) => {
      const sim = typeof h.similarity === 'number' ? h.similarity.toFixed(2) : '?';
      const body = (h.content || '').substring(0, 2500);
      return `### Dokumentträff ${i + 1} (relevans ${sim})\n${body}`;
    });

    let block = lines.join('\n\n');
    if (block.length > 20000) {
      block = block.substring(0, 20000) + '\n\n[...trunkerad]';
    }

    return `\n\n--- FASTIGHETSDOKUMENT (uppladdade filer) ---\nAnvänd dessa som källa och nämn dokumentnamn när det går.\n${block}\n--- SLUT PÅ FASTIGHETSDOKUMENT ---`;
  } catch (e) {
    console.error('Property document search error:', e);
    return '';
  }
}

const systemPromptBase = `Du är Jarvis — AI-assistent för fastighetsförvaltning (Liljeblads) med djup kunskap om svensk fastighetsrätt, entreprenadjuridik (ABT 06) och branschstandarder.

VERKTYG (använd dem aktivt):
- list_properties, get_project, list_work_orders, list_services, search_components: LÄS data från systemet
- list_high_risk_components: prediktiv Weibull-risk (högrisk, prioritering, utbyte)
- get_property_overview: samlad bild av en fastighet (komponenter, WO, risk, plan, dokumentlista) — använd först vid fastighetsfrågor
- search_property_documents: sök i uppladdade/indexerade fastighetsdokument
- draft_work_order_order_text: skapa UTKAST till beställningstext (skickar INTE mail)
- suggest_work_order / suggest_todo: spara förslag som UTKAST (kräver användarens godkännande i UI)

VIKTIGA REGLER:
1. Svara ALLTID på svenska
2. Var KONKRET — referera till faktisk data, namn, siffror och datum från verktyg
3. Anropa verktyg hellre än att gissa. Om du saknar data: anropa rätt verktyg.
4. Skillnad: DRIFTUPPGIFTER (kvartalsvis underhåll) vs ATT GÖRA (todos med deadline)
5. Ge alltid siffror vid översikter
6. suggest_*: confidence >= 0.7, förklara reasoning kort
7. Skapa ALDRIG arbetsordrar/todos direkt i DB utan suggest_* (human-in-the-loop)
8. Projektnummer i frågan = exakt referens

KÄLLHÄNVISNING:
- Kunskapsbas: "Enligt ABT 06..."
- Fastighetsdokument: nämn filnamn
- Systemdata: nämn fastighet/projekt/WO

SVARSFORMAT:
📊 SAMMANFATTNING
🔍 DETALJER
⚠️ AVVIKELSER & REKOMMENDATIONER (vid behov)

FÖLJDFRÅGOR:
Avsluta med 2-3 förslag under "---" radvis: "👉 [fråga]".`;

// ── Main handler ─────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    checkCircuitBreaker();

    const { messages, stream: streamRequested, conversationId } = await req.json();
    const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GEMINI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    if (!isLlmConfigured()) {
      return jsonResponse({
        error: 'AI är inte konfigurerad. Sätt GOOGLE_AI_API_KEY (Gemini) eller XAI_API_KEY.',
      }, 500);
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
    
    // Try profile first, then fall back to organization_members
    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', userId).single();
    let orgId = profile?.organization_id;
    
    if (!orgId) {
      // Fallback: look up organization via organization_members table
      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      orgId = membership?.organization_id;
    }
    
    if (!orgId) {
      return jsonResponse({ error: 'Ingen organisation hittades för din användare. Kontakta administratören.' }, 403);
    }

    // ── Build context & knowledge base search in parallel ──
    const lastUserMsg = messages.filter((m: any) => m.role === 'user').pop();
    let contextInfo = '';
    let knowledgeBaseContext = '';

    let propertyDocsContext = '';
    if (lastUserMsg?.content) {
      try {
        console.log(`Building context for org: ${orgId}, msg: "${lastUserMsg.content.substring(0, 50)}"`);
        
        const contextPromises: Promise<string>[] = [
          buildContext(supabase, orgId, lastUserMsg.content),
        ];

        // Search knowledge base + property documents if GOOGLE_AI_API_KEY is available
        if (GOOGLE_AI_API_KEY) {
          contextPromises.push(
            searchKnowledgeBase(supabase, lastUserMsg.content, GOOGLE_AI_API_KEY)
          );
          contextPromises.push(
            searchPropertyDocuments(supabase, orgId, lastUserMsg.content, GOOGLE_AI_API_KEY)
          );
        }

        const results = await Promise.all(contextPromises);
        contextInfo = results[0] || '';
        knowledgeBaseContext = results[1] || '';
        propertyDocsContext = results[2] || '';
        
        console.log(
          `Context built (${contextInfo.length} chars), KB (${knowledgeBaseContext.length}), docs (${propertyDocsContext.length})`,
        );
      } catch (e) {
        console.error('Context build error:', e instanceof Error ? e.message : e);
      }
    }

    const systemPrompt = systemPromptBase + contextInfo + knowledgeBaseContext + propertyDocsContext;

    // Streaming: no tools (SSE text only). Non-stream: Jarvis tool loop.
    if (streamRequested) {
      try {
        const aiResult = await chatCompletion({
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          stream: true,
        });
        cb.failures = 0; cb.isOpen = false;
        if (aiResult instanceof Response) {
          return new Response(aiResult.body, {
            headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
          });
        }
      } catch (aiErr) {
        const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
        console.error('LLM stream error:', msg);
        cb.failures++; cb.lastFailure = Date.now();
        if (cb.failures >= cb.threshold) cb.isOpen = true;
        if (/429|RESOURCE_EXHAUSTED|rate/i.test(msg)) {
          return jsonResponse({ error: 'För många förfrågningar. Försök igen om en stund.' }, 429);
        }
        return jsonResponse({ error: `AI-fel: ${msg.slice(0, 200)}` }, 502);
      }
    }

    // ── Jarvis multi-turn tool loop ──
    const workingMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const suggestedActions: any[] = [];
    const toolsUsed: string[] = [];
    const MAX_ROUNDS = 4;
    let finalMessage = '';

    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const aiResult = await chatCompletion({
          messages: workingMessages,
          stream: false,
          tools: jarvisTools,
          tool_choice: 'auto',
          temperature: 0.3,
        });

        if (aiResult instanceof Response) {
          throw new Error('Unexpected stream in tool loop');
        }

        const data = aiResult as ChatCompletionResponse;
        const choice = data.choices?.[0];
        const toolCalls = choice?.message?.tool_calls || [];
        const content = choice?.message?.content || '';

        if (!toolCalls.length) {
          finalMessage = content;
          break;
        }

        // Record assistant tool call turn
        workingMessages.push({
          role: 'assistant',
          content: content || null,
          tool_calls: toolCalls,
        });

        for (const tc of toolCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || '{}');
          } catch {
            args = {};
          }
          const toolName = tc.function.name;
          toolsUsed.push(toolName);
          console.log(`Jarvis tool[${round}]: ${toolName}`, JSON.stringify(args).slice(0, 200));

          const result = await executeJarvisTool(toolName, args, {
            supabase,
            orgId,
            userId,
            conversationId,
          });

          // Collect HITL suggestions for UI
          if (
            (toolName === 'suggest_work_order' || toolName === 'suggest_todo') &&
            result &&
            typeof result === 'object' &&
            (result as { stored?: boolean }).stored &&
            (result as { suggestion?: Record<string, unknown> }).suggestion
          ) {
            const s = (result as { suggestion: Record<string, unknown> }).suggestion;
            suggestedActions.push({
              id: s.id,
              type: s.action_type,
              ...args,
              confidence: s.confidence_score ?? args.confidence,
              reasoning: s.reasoning ?? args.reasoning,
            });
          }

          workingMessages.push({
            role: 'tool',
            name: toolName,
            content: JSON.stringify(result).slice(0, 12000),
          });
        }

        // Last round: force a text answer without more tools
        if (round === MAX_ROUNDS - 1) {
          const close = await chatCompletion({
            messages: [
              ...workingMessages,
              {
                role: 'user',
                content:
                  'Sammanfatta nu ett slutgiltigt svar till användaren baserat på verktygsresultaten. Anropa inte fler verktyg.',
              },
            ],
            stream: false,
            temperature: 0.3,
          });
          if (!(close instanceof Response)) {
            finalMessage = close.choices?.[0]?.message?.content || content;
          }
        }
      }

      cb.failures = 0; cb.isOpen = false;
    } catch (aiErr) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      console.error('LLM tool-loop error:', msg);
      cb.failures++; cb.lastFailure = Date.now();
      if (cb.failures >= cb.threshold) cb.isOpen = true;
      if (/429|RESOURCE_EXHAUSTED|rate/i.test(msg)) {
        return jsonResponse({ error: 'För många förfrågningar. Försök igen om en stund.' }, 429);
      }
      return jsonResponse({ error: `AI-fel: ${msg.slice(0, 200)}` }, 502);
    }

    return jsonResponse({
      message:
        finalMessage ||
        'Jag har hämtat data men kunde inte formulera ett svar. Försök omformulera frågan.',
      suggestedActions,
      toolsUsed,
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
