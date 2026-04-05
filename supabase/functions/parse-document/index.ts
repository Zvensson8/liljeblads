import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  const publicMatch = url.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/);
  if (publicMatch) return { bucket: publicMatch[1], path: publicMatch[2] };
  const privateMatch = url.match(/\/storage\/v1\/object\/([^\/]+)\/(.+)$/);
  if (privateMatch) return { bucket: privateMatch[1], path: privateMatch[2] };
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Decode JWT to get user ID
    const token = authHeader.replace('Bearer ', '');
    let userId: string;
    try {
      const payloadB64 = token.split('.')[1];
      const payload = JSON.parse(atob(payloadB64));
      userId = payload.sub;
      if (!userId) throw new Error('No sub');
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create auth client for storage RLS
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { url, maxPages = 10 } = await req.json();

    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`User ${userId} parsing PDF from URL: ${url}`);

    let data: Uint8Array;

    // Check if this is a Supabase storage URL
    if (url.includes(supabaseUrl) || url.includes('supabase.co/storage')) {
      const parsed = parseStorageUrl(url);

      if (parsed) {
        console.log(`Detected storage: bucket=${parsed.bucket}, path=${parsed.path}`);

        // Use the USER's auth client to download - this enforces storage RLS
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
        data = new Uint8Array(arrayBuffer);
        console.log(`Downloaded from storage, size: ${data.length} bytes`);
      } else {
        const pdfResponse = await fetch(url);
        if (!pdfResponse.ok) {
          return new Response(JSON.stringify({ error: 'Failed to fetch PDF', text: '' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const arrayBuffer = await pdfResponse.arrayBuffer();
        data = new Uint8Array(arrayBuffer);
      }
    } else {
      // External URL - direct fetch (user authenticated, so this is allowed)
      const pdfResponse = await fetch(url);
      if (!pdfResponse.ok) {
        return new Response(JSON.stringify({ error: 'Failed to fetch PDF', text: '' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const arrayBuffer = await pdfResponse.arrayBuffer();
      data = new Uint8Array(arrayBuffer);
    }

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
