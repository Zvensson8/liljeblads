import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Parse Supabase storage URL to extract bucket and path
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  // Match pattern: /storage/v1/object/public/{bucket}/{path}
  // or: /storage/v1/object/{bucket}/{path}
  const publicMatch = url.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/);
  if (publicMatch) {
    return { bucket: publicMatch[1], path: publicMatch[2] };
  }
  
  const privateMatch = url.match(/\/storage\/v1\/object\/([^\/]+)\/(.+)$/);
  if (privateMatch) {
    return { bucket: privateMatch[1], path: privateMatch[2] };
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, maxPages = 10 } = await req.json();

    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Parsing PDF from URL: ${url}`);

    let data: Uint8Array;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    // Check if this is a Supabase storage URL (may be private bucket)
    if (url.includes(supabaseUrl) || url.includes('supabase.co/storage')) {
      const parsed = parseStorageUrl(url);
      
      if (parsed) {
        console.log(`Detected Supabase storage: bucket=${parsed.bucket}, path=${parsed.path}`);
        
        // Use service role to download from potentially private bucket
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        const { data: fileData, error: downloadError } = await supabase.storage
          .from(parsed.bucket)
          .download(parsed.path);
        
        if (downloadError || !fileData) {
          console.error(`Failed to download from storage: ${downloadError?.message}`);
          return new Response(JSON.stringify({ error: 'Failed to fetch PDF from storage', text: '' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const arrayBuffer = await fileData.arrayBuffer();
        data = new Uint8Array(arrayBuffer);
        console.log(`Downloaded from Supabase storage, size: ${data.length} bytes`);
      } else {
        // Fallback to direct fetch (public URL)
        const pdfResponse = await fetch(url);
        if (!pdfResponse.ok) {
          console.error(`Failed to fetch PDF: ${pdfResponse.status}`);
          return new Response(JSON.stringify({ error: 'Failed to fetch PDF', text: '' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const arrayBuffer = await pdfResponse.arrayBuffer();
        data = new Uint8Array(arrayBuffer);
      }
    } else {
      // External URL - use direct fetch
      const pdfResponse = await fetch(url);
      if (!pdfResponse.ok) {
        console.error(`Failed to fetch PDF: ${pdfResponse.status}`);
        return new Response(JSON.stringify({ error: 'Failed to fetch PDF', text: '' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const arrayBuffer = await pdfResponse.arrayBuffer();
      data = new Uint8Array(arrayBuffer);
    }

    console.log(`PDF fetched, size: ${data.length} bytes`);

    // Use dynamic import for pdfjs-serverless
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

    // Limit text length to avoid overly large embeddings
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
