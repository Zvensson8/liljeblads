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
import {
  hasExplicitWriteIntent,
  toolsIncludeWrite,
  INTENT_FORCE_USER_NUDGE,
} from "../_shared/jarvisIntent.ts";
import { colleagueSpeak, looksLikeReport } from "../_shared/colleagueSpeak.ts";

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

  // 5. Contacts (keyword-triggered)
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

  // 7. Todos (keyword-triggered)
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
LÄS:
- list_properties (alla kritiska fält inkl. invoice_address, loa, area_sqm, construction_year)
- get_project, list_work_orders, list_services, search_components, list_contacts
- list_high_risk_components, get_property_overview, search_property_documents
- list_property_documents (lista filer + om AI-indexerade), list_document_ingest_batches (zip/mapp-batcher)
- get_daily_briefing (morgonstatus / vad behöver göras)
- draft_work_order_order_text (skickar INTE mail)
- Extern filåtkomst: användaren laddar upp zip/mapp under Fastighet → Dokument (data stannar i systemet). Godtycklig path/URL stöds INTE.

GROUNDING (sanning från verktyg — non-negotiable):
- Svara ALDRIG "finns inte" / "saknas" utan att ha anropat rätt verktyg och sett fältet.
- Om verktyget returnerar ett värde: citera det exakt (inkl. radbrytningar i fakturaadress).
- Om fältet är null/tomt: säg tydligt "ej registrerad i systemet" (inte generiskt "saknas").
- Fältet fakturaadress heter invoice_address på properties.
- Om SIDOKONTEXT anger property_id/project_id: använd det som default (användaren är på den sidan).
- Underhållsplan = maintenance_plans + maintenance_plan_items. Att-göra = property_todos. Blanda inte.

SKRIV — VÄLJ RÄTT LÄGE:
A) ANVÄNDAREN BER UTTRYCKLIGEN dig att göra något ("skapa", "ändra status", "uppdatera", "lägg till", "logga service", "skicka till mig"):
   → Använd apply_* eller send_to_me DIREKT (utförs genast i databasen/mejl).
   - apply_create_work_order, apply_create_project, apply_property_note, apply_create_todo
   - apply_update_invoice_address, apply_create_property, apply_update_property
   - apply_work_order_status, apply_project_status, apply_update_project
   - "Sätt/ändra budget på projekt" = apply_update_project (fältet projects.budget). apply_add_budget_item är bara en rad, inte totalbudget.
   - Statusändring och arkivering är reversibla (inte radering). Utför DIREKT utan att be om bekräftelse.
   - "Ta bort"/"radera" en WO eller ett projekt = arkivera (WO status archived, projekt avslutat + is_archived). Permanent delete finns inte.
   - apply_create_component, apply_update_component, apply_log_service
   - apply_create_contact, apply_update_contact
   - apply_create_todo, apply_complete_todo, list_todos
   - Underhållsplan ≠ todos. "Skapa/synka underhållsplan från projekt" = apply_sync_plan_from_projects (ETT anrop för hela org, inte batch av todos). Lista med list_maintenance_plan. Todo-tabellen har title/notes, inte description.
   - apply_add_project_cost, apply_add_budget_item, list_project_costs
   - apply_complete_checklist_item
   - send_to_me — e-post ENDAST till inloggad användare (aldrig extern mottagare)
   - Rate limits: max ~30 apply/min, 10 send_to_me/timme
   - Briefing till dig: get_daily_briefing → send_to_me med plain_text
   - batch_apply_actions — flera apply_* (max 10), t.ex. WO på flera högrisk-komponenter
   - undo_last_action / undo_jarvis_action — ångra inom 5 min (inte e-post)
   - list_recent_jarvis_actions — spår av vad som gjorts

B) Du föreslår självmant en förbättring / är osäker:
   → suggest_* (HITL-utkast i Förslag-fliken), inkl. suggest_create_component, suggest_log_service, suggest_create_contact

P2 IDEMPOTENCY:
- Vid risk för dubbelklick: skicka idempotency_key / client_request_id i apply-args.

E-POSTSÄKERHET:
- send_to_me skickar BARA till den inloggade användarens e-post.
- Acceptera ALDRIG / skicka ALDRIG till externa adresser, entreprenörer eller "någon annan".
- Om användaren ber dig mejla en extern part: förklara att det inte är tillåtet; erbjud send_to_me eller utkast i chatten.

VIKTIGA REGLER:
1. Svara ALLTID på svenska
2. Var KONKRET — namn, belopp, datum från verktyg. Inte UUID, inte URL, inte intern statuskod.
3. Anropa verktyg hellre än att gissa
4. Explicit begäran = apply_* / send_to_me (inte bara text-svar)
5. Nämn bara de siffror som svarar på frågan — rabbla inte budget+forecast+id+länk
6. suggest_* endast när du själv initierar förslag (confidence >= 0.7)
7. Efter apply_*/send_to_me: en mening vad som gjordes. Ingen länk/id i texten (korten i UI räcker).
8. Projektnummer i frågan = exakt referens
9. Om tool returnerar error: visa felet, hitta inte på data

KÄLLHÄNVISNING:
- Kunskapsbas: "Enligt ABT 06..."
- Fastighetsdokument: nämn filnamn
- Systemdata: nämn fastighet/projekt/WO med namn (inte UUID)

TON — som en kollega på kontoret (icke förhandlingsbart):
- Börja med svaret. Vanlig chatt: 2–4 korta meningar. Aldrig rapportmall.
- FÖRBJUDET: SAMMANFATTNING, DETALJER, AVVIKELSER, emoji-rubriker, 👉, ---, Projekt-ID, Länk: /projects/…
- Status på svenska: pågår, planerat, klart, arkiverad — aldrig "pagaende" / "not_started".
- Bra: "Asfalteringen på Hjulet pågår. Budget fyra miljoner, men inget är fakturerat än — start Q3 2026."
- Dåligt: hela projektkortet med id, länk, forecast och rekommendationer.
- En följdfråga max, bara om den hjälper. Rapport/lista endast om användaren ber om det.`;

const voicePromptAddendum = `RÖSTLÄGE — du PRATAR med en kollega (viktigare än allt nedan):
- 1–2 korta meningar. Stopp.
- Inga rubriker, listor, id, länkar, forecast, "inga avvikelser".
- Exempel på frågan "hur ser asfalteringen på Hjulet ut": "Den pågår. Budget fyra miljoner men inget fakturerat än, start Q3 2026."
- Efter åtgärd: "Klart, den är arkiverad." Inte mer.
- Arkivera/status: gör det. Fråga inte om lov.

`;

// ── Main handler ─────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    checkCircuitBreaker();

    const {
      messages,
      stream: streamRequested,
      conversationId,
      pageContext,
      voice,
    } = await req.json();
    const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GEMINI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    if (!isLlmConfigured()) {
      return jsonResponse({
        error: 'AI är inte konfigurerad. Sätt XAI_API_KEY (Grok, rekommenderat) eller GOOGLE_AI_API_KEY (Gemini).',
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
    const userEmail = userData.user.email ?? null;

    // ── Rate limit ──
    const rateResult = await checkRateLimit(userId, { endpoint: 'ai-chat', maxRequests: 20, windowSeconds: 60 });
    const rateLimited = rateLimitResponse(rateResult, corsHeaders);
    if (rateLimited) return rateLimited;

    // ── GUARD NODE: resolve active org + membership ──
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id, active_organization_id')
      .eq('id', userId)
      .single();

    let orgId =
      (profile as { active_organization_id?: string | null } | null)?.active_organization_id ||
      profile?.organization_id ||
      null;

    if (!orgId) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      orgId = membership?.organization_id ?? null;
    }

    if (!orgId) {
      return jsonResponse({
        error: 'Ingen organisation hittades för din användare. Kontakta administratören.',
      }, 403);
    }

    // Membership must exist for active org (except platform founders handled separately if needed)
    const { data: memberRow } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .maybeSingle();

    let memberRole: string | null = (memberRow?.role as string) || null;

    if (!memberRow) {
      // Founders may still chat against an org they "activated" for support
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'founder')
        .maybeSingle();
      if (!roles) {
        return jsonResponse({ error: 'Du är inte medlem i den aktiva organisationen.' }, 403);
      }
      memberRole = 'founder';
    }

    // ── CONTEXT NODE (fetch) ──
    const lastUserMsg = messages.filter((m: any) => m.role === 'user').pop();
    let contextInfo = '';
    let knowledgeBaseContext = '';
    let propertyDocsContext = '';

    if (lastUserMsg?.content) {
      try {
        console.log(`[guard] org=${orgId} msg="${String(lastUserMsg.content).substring(0, 50)}"`);

        const contextPromises: Promise<string>[] = [
          buildContext(supabase, orgId, lastUserMsg.content),
        ];

        const wantsDocs = /dokument|avtal|protokoll|ab[t6]|pdf|ritning|standard|föreskrift/i
          .test(String(lastUserMsg.content));
        const isVoice = voice === true || voice === 'true';
        // Voice + "hur ligger projektet?" — skip slow embedding searches
        if (GOOGLE_AI_API_KEY && (!isVoice || wantsDocs)) {
          contextPromises.push(
            searchKnowledgeBase(supabase, lastUserMsg.content, GOOGLE_AI_API_KEY),
          );
          contextPromises.push(
            searchPropertyDocuments(supabase, orgId, lastUserMsg.content, GOOGLE_AI_API_KEY),
          );
        }

        const results = await Promise.all(contextPromises);
        contextInfo = results[0] || '';
        knowledgeBaseContext = results[1] || '';
        propertyDocsContext = results[2] || '';

        console.log(
          `[context] data=${contextInfo.length} kb=${knowledgeBaseContext.length} docs=${propertyDocsContext.length}`,
        );
      } catch (e) {
        console.error('Context build error:', e instanceof Error ? e.message : e);
      }
    }

    let pageContextBlock = '';
    if (pageContext && typeof pageContext === 'object') {
      const pc = pageContext as {
        property_id?: string;
        project_id?: string;
        component_id?: string;
        path?: string;
        label?: string;
      };
      const parts: string[] = [];
      if (pc.property_id) parts.push(`property_id=${pc.property_id}`);
      if (pc.project_id) parts.push(`project_id=${pc.project_id}`);
      if (pc.component_id) parts.push(`component_id=${pc.component_id}`);
      if (pc.path) parts.push(`path=${pc.path}`);
      if (pc.label) parts.push(`vy=${pc.label}`);
      if (parts.length) {
        pageContextBlock =
          `\n\nSIDOKONTEXT (användaren tittar här nu — använd som default om frågan inte anger annan fastighet/projekt):\n` +
          parts.join(', ') +
          `\nOm användaren säger "denna fastighet" / "detta projekt" → använd dessa id:n.`;
      }
    }

    const isVoiceTurn = voice === true || voice === 'true';
    const systemPrompt =
      (isVoiceTurn ? voicePromptAddendum : '') +
      systemPromptBase +
      `\n\nAKTIV ORGANISATION (scope): ${orgId}. Använd endast data från denna org.` +
      pageContextBlock +
      contextInfo +
      knowledgeBaseContext +
      propertyDocsContext;

    // Streaming: text-only path (no tools)
    if (streamRequested) {
      try {
        const aiResult = await chatCompletion({
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          stream: true,
        });
        cb.failures = 0;
        cb.isOpen = false;
        if (aiResult instanceof Response) {
          return new Response(aiResult.body, {
            headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
          });
        }
      } catch (aiErr) {
        const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
        console.error('LLM stream error:', msg);
        cb.failures++;
        cb.lastFailure = Date.now();
        if (cb.failures >= cb.threshold) cb.isOpen = true;
        if (/429|RESOURCE_EXHAUSTED|rate/i.test(msg)) {
          return jsonResponse({ error: 'För många förfrågningar. Försök igen om en stund.' }, 429);
        }
        return jsonResponse({ error: `AI-fel: ${msg.slice(0, 200)}` }, 502);
      }
    }

    // ── PLANNER + EXECUTOR LOOP ──
    // Planner: model chooses tools (tool_choice auto)
    // Executor: executeJarvisTool with org-scoped supabase + orgId
    // Guard: orgId injected; tools must not receive cross-org ids from client alone
    const workingMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const suggestedActions: any[] = [];
    const appliedActions: Array<{
      tool: string;
      success: boolean;
      summary?: string;
      link?: string | null;
      entity_type?: string | null;
      entity_id?: string | null;
      sent?: boolean;
    }> = [];
    const toolsUsed: string[] = [];
    const graphTrace: Array<{ round: number; phase: string; detail?: string }> = [
      { round: 0, phase: 'guard', detail: `org=${orgId}` },
      { round: 0, phase: 'context' },
    ];
    const MAX_ROUNDS = isVoiceTurn ? 3 : 5;
    let finalMessage = '';
    let intentNudgeUsed = false;

    const lastUserText = String(
      [...messages].reverse().find((m: { role?: string }) => m.role === 'user')
        ?.content || '',
    );
    const needsWrite = hasExplicitWriteIntent(lastUserText);

    const safePageContext =
      pageContext && typeof pageContext === 'object'
        ? {
            property_id: (pageContext as { property_id?: string }).property_id,
            project_id: (pageContext as { project_id?: string }).project_id,
            component_id: (pageContext as { component_id?: string }).component_id,
            path: (pageContext as { path?: string }).path,
          }
        : null;

    // Fas 3: org glossary into system prompt
    try {
      const { data: gloss } = await supabase
        .from('organization_glossary')
        .select('term, meaning')
        .eq('organization_id', orgId)
        .limit(40);
      if (gloss?.length) {
        const lines = gloss
          .map((g) => `- ${g.term}: ${g.meaning}`)
          .join('\n');
        workingMessages[0] = {
          role: 'system',
          content:
            String((workingMessages[0] as { content?: string }).content || '') +
            `\n\nORG-GLOSSARIUM (använd dessa termer):\n${lines}`,
        };
      }
    } catch {
      /* table may not exist yet */
    }

    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        // PLANNER node
        graphTrace.push({ round, phase: 'planner' });
        const aiResult = await chatCompletion({
          messages: workingMessages,
          stream: false,
          tools: jarvisTools,
          tool_choice: 'auto',
          temperature: 0.3,
          max_tokens: isVoiceTurn ? 400 : undefined,
        });

        if (aiResult instanceof Response) {
          throw new Error('Unexpected stream in tool loop');
        }

        const data = aiResult as ChatCompletionResponse;
        const choice = data.choices?.[0];
        const toolCalls = choice?.message?.tool_calls || [];
        const content = choice?.message?.content || '';

        if (!toolCalls.length) {
          // Fas 1A: write intent but no tools → force one more planner round
          if (needsWrite && !toolsIncludeWrite(toolsUsed) && !intentNudgeUsed) {
            intentNudgeUsed = true;
            graphTrace.push({ round, phase: 'intent_force' });
            workingMessages.push({
              role: 'user',
              content: INTENT_FORCE_USER_NUDGE,
            });
            continue;
          }
          finalMessage = content;
          graphTrace.push({ round, phase: 'respond' });
          break;
        }

        workingMessages.push({
          role: 'assistant',
          content: content || null,
          tool_calls: toolCalls,
        });

        // EXECUTOR node(s)
        for (const tc of toolCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || '{}');
          } catch {
            args = {};
          }
          // Never trust client-supplied org overrides
          delete args.organization_id;
          delete args.org_id;

          const toolName = tc.function.name;
          toolsUsed.push(toolName);
          graphTrace.push({ round, phase: 'executor', detail: toolName });
          console.log(`[executor] round=${round} tool=${toolName}`, JSON.stringify(args).slice(0, 200));

          const result = await executeJarvisTool(toolName, args, {
            supabase,
            orgId,
            userId,
            userEmail,
            conversationId,
            memberRole,
            pageContext: safePageContext,
          });

          if (
            toolName.startsWith('suggest_') &&
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

          if (
            (toolName.startsWith('apply_') ||
              toolName === 'send_to_me' ||
              toolName === 'batch_apply_actions' ||
              toolName === 'undo_last_action' ||
              toolName === 'undo_jarvis_action') &&
            result &&
            typeof result === 'object'
          ) {
            const r = result as Record<string, unknown>;
            const ui = (r.ui || {}) as {
              link?: string | null;
              entity_type?: string | null;
              entity_id?: string | null;
            };
            const entityFromNested = (() => {
              if (r.work_order && typeof r.work_order === 'object') {
                return {
                  entity_type: 'work_order',
                  entity_id: String((r.work_order as { id?: string }).id || '') || null,
                };
              }
              if (r.project && typeof r.project === 'object') {
                return {
                  entity_type: 'project',
                  entity_id: String((r.project as { id?: string }).id || '') || null,
                };
              }
              if (r.component && typeof r.component === 'object') {
                return {
                  entity_type: 'component',
                  entity_id: String((r.component as { id?: string }).id || '') || null,
                };
              }
              if (r.property && typeof r.property === 'object') {
                return {
                  entity_type: 'property',
                  entity_id: String((r.property as { id?: string }).id || '') || null,
                };
              }
              return { entity_type: ui.entity_type ?? null, entity_id: ui.entity_id ?? null };
            })();

            const batchResults = Array.isArray(r.results)
              ? (r.results as Array<Record<string, unknown>>).map((br) => ({
                  tool: String(br.tool || ''),
                  success: br.success === true,
                  summary: String(br.summary || br.error || ''),
                  link: (br.link as string) || null,
                  entity_type: (br.entity_type as string) || null,
                  entity_id: (br.entity_id as string) || null,
                  action_log_id: (br.action_log_id as string) || null,
                  undoable: br.undoable === true,
                }))
              : undefined;

            const success =
              !r.error &&
              (r.applied === true ||
                r.sent === true ||
                r.undone === true ||
                r.batch === true);
            // Undo for any successful apply_* (backend may omit flag if old deploy / log fail)
            const undoable =
              r.undoable === true ||
              (success &&
                toolName.startsWith('apply_') &&
                toolName !== 'apply_create_property'); // property create may fail undo if has comps

            appliedActions.push({
              tool: toolName,
              success,
              summary: String(r.summary || r.error || r.to_note || toolName),
              link: (r.link_hint as string) || ui.link || null,
              entity_type: entityFromNested.entity_type,
              entity_id: entityFromNested.entity_id,
              sent: r.sent === true,
              action_log_id: (r.action_log_id as string) || null,
              undoable,
              undo_until: (r.undo_until as string) || null,
              batch: r.batch === true,
              results: batchResults,
            });
          }

          // xAI/OpenAI require tool_call_id linking tool results to the assistant tool_calls
          workingMessages.push({
            role: 'tool',
            name: toolName,
            tool_call_id: tc.id || `call_${toolName}_${round}`,
            content: JSON.stringify(result).slice(0, 12000),
          });
        }

        if (round === MAX_ROUNDS - 1) {
          graphTrace.push({ round, phase: 'respond_forced' });
          const close = await chatCompletion({
            messages: [
              ...workingMessages,
              {
                role: 'user',
                content: isVoiceTurn
                  ? 'Svara nu som en kollega i 1–2 korta meningar. Inga rubriker, UUID, länkar eller listor. Bara det användaren frågade. Anropa inte fler verktyg.'
                  : 'Svara nu i 2–4 korta meningar som en kollega, baserat på verktygsresultaten. Ingen rapportmall. Anropa inte fler verktyg.',
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

      cb.failures = 0;
      cb.isOpen = false;
    } catch (aiErr) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      console.error('LLM tool-loop error:', msg);
      cb.failures++;
      cb.lastFailure = Date.now();
      if (cb.failures >= cb.threshold) cb.isOpen = true;
      if (/429|RESOURCE_EXHAUSTED|rate/i.test(msg)) {
        return jsonResponse({ error: 'För många förfrågningar. Försök igen om en stund.' }, 429);
      }
      return jsonResponse({ error: `AI-fel: ${msg.slice(0, 200)}` }, 502);
    }

    let reply =
      finalMessage ||
      'Jag har hämtat data men kunde inte formulera ett svar. Försök omformulera frågan.';
    if (isVoiceTurn) {
      reply = colleagueSpeak(reply, 2, 360);
    } else if (looksLikeReport(reply)) {
      reply = colleagueSpeak(reply, 4, 720);
    }

    return jsonResponse({
      message: reply,
      suggestedActions,
      appliedActions,
      toolsUsed,
      graphTrace,
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
