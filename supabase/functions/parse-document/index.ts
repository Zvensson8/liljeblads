import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUserOrServiceRole } from "../_shared/requireUser.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const path = new URL(url).pathname;
    const patterns = [
      /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/,
      /\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/,
      /\/storage\/v1\/object\/authenticated\/([^/]+)\/(.+)$/,
    ];
    for (const re of patterns) {
      const match = path.match(re);
      if (match) {
        return {
          bucket: decodeURIComponent(match[1]),
          path: decodeURIComponent(match[2]),
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const authed = await requireUserOrServiceRole(req, corsHeaders);
    if ('response' in authed) return authed.response;

    const isServiceRole = authed.kind === 'service';
    const userId = isServiceRole ? 'service_role' : authed.user.id;

    // Service role (raw key only) bypasses storage RLS; user JWT enforces it
    const authClient = isServiceRole
      ? createClient(supabaseUrl, supabaseServiceKey)
      : createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: req.headers.get('Authorization')! } },
        });

    const { url, maxPages: rawMaxPages = 10 } = await req.json();
    const maxPages = Math.min(Math.max(Number(rawMaxPages) || 10, 1), 80);

    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = parseStorageUrl(url);
    const isOwnStorage =
      Boolean(parsed) &&
      (url.startsWith(`${supabaseUrl}/`) || url.includes('.supabase.co/storage/'));
    if (!isOwnStorage || !parsed) {
      return new Response(
        JSON.stringify({ error: 'Only project storage URLs are allowed', text: '' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`User ${userId} parsing PDF from storage: ${parsed.bucket}/${parsed.path}`);

    const { data: fileData, error: downloadError } = await authClient.storage
      .from(parsed.bucket)
      .download(parsed.path);

    if (downloadError || !fileData) {
      console.error(`Storage download failed: ${downloadError?.message}`);
      return new Response(JSON.stringify({ error: 'Access denied or file not found', text: '' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    console.log(`PDF fetched, size: ${data.length} bytes`);

    const { getDocument } = await import('https://esm.sh/pdfjs-serverless');

    const document = await getDocument({
      data,
      useSystemFonts: true,
    }).promise;

    console.log(`PDF loaded, pages: ${document.numPages}`);

    const textParts: string[] = [];
    const pagesToParse = Math.min(document.numPages, maxPages);

    for (let i = 1; i <= pagesToParse; i++) {
      try {
        const page = await document.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');

        if (pageText.trim()) {
          textParts.push(`[Sida ${i}]\n${pageText.trim()}`);
        }
      } catch (pageError) {
        console.error(`Error parsing page ${i}:`, pageError);
      }
    }

    let fullText = textParts.join('\n\n');
    console.log(`Extracted ${fullText.length} characters from PDF`);

    const maxLength = 15000;
    const truncated = fullText.length > maxLength;
    if (truncated) {
      fullText = fullText.substring(0, maxLength) + '... [text trunkerad]';
    }

    return new Response(JSON.stringify({
      text: fullText,
      truncated,
      pages: pagesToParse,
      totalPages: document.numPages,
      method: 'pdfjs-serverless'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error parsing PDF:', error);

    return new Response(JSON.stringify({
      text: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
