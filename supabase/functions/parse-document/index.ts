import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple text extraction from PDF by parsing raw content
// This extracts readable text from PDF binary without external dependencies
function extractTextFromPdfBytes(bytes: Uint8Array): string {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const content = decoder.decode(bytes);
  
  const textParts: string[] = [];
  
  // Method 1: Extract text from BT...ET text blocks
  const textBlockRegex = /BT\s*([\s\S]*?)\s*ET/g;
  let match;
  while ((match = textBlockRegex.exec(content)) !== null) {
    const block = match[1];
    
    // Extract text in parentheses (literal strings)
    const parenRegex = /\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
    let textMatch;
    while ((textMatch = parenRegex.exec(block)) !== null) {
      let text = textMatch[1];
      // Unescape common PDF escape sequences
      text = text
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\');
      if (text.trim()) {
        textParts.push(text.trim());
      }
    }
    
    // Extract text in hex format <hexstring>
    const hexRegex = /<([0-9A-Fa-f\s]+)>/g;
    while ((textMatch = hexRegex.exec(block)) !== null) {
      const hex = textMatch[1].replace(/\s/g, '');
      try {
        // Try to decode as UTF-16BE (common in PDFs)
        const bytes: number[] = [];
        for (let i = 0; i < hex.length; i += 4) {
          if (i + 4 <= hex.length) {
            const charCode = parseInt(hex.substr(i, 4), 16);
            if (charCode > 0 && charCode < 65535) {
              bytes.push(charCode);
            }
          }
        }
        if (bytes.length > 0) {
          const text = String.fromCharCode(...bytes);
          if (text.trim() && /[\w\såäöÅÄÖ]/.test(text)) {
            textParts.push(text.trim());
          }
        }
      } catch (e) {
        // Ignore hex parsing errors
      }
    }
  }
  
  // Method 2: Also try to find text streams
  const streamRegex = /stream\s*([\s\S]*?)\s*endstream/g;
  while ((match = streamRegex.exec(content)) !== null) {
    const stream = match[1];
    
    // Look for text in parentheses within streams
    const parenRegex = /\(([^()]{3,100})\)/g;
    let textMatch;
    while ((textMatch = parenRegex.exec(stream)) !== null) {
      let text = textMatch[1];
      // Only keep if it looks like readable text
      if (/^[\w\s.,!?:;\-åäöÅÄÖéèêëàâùûôîïç()\/\d%°]+$/.test(text) && text.length > 2) {
        text = text
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')');
        if (text.trim()) {
          textParts.push(text.trim());
        }
      }
    }
  }
  
  // Combine and clean up
  let fullText = textParts.join(' ');
  
  // Clean up common artifacts
  fullText = fullText
    .replace(/\s+/g, ' ')
    .replace(/(\w)\s+(\w)/g, '$1 $2') // Normalize spacing
    .trim();
  
  return fullText;
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

    // Fetch the PDF file
    const pdfResponse = await fetch(url);
    if (!pdfResponse.ok) {
      console.error(`Failed to fetch PDF: ${pdfResponse.status}`);
      return new Response(JSON.stringify({ error: 'Failed to fetch PDF', text: '' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const arrayBuffer = await pdfResponse.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    console.log(`PDF fetched, size: ${data.length} bytes`);

    // Extract text from PDF
    let fullText = extractTextFromPdfBytes(data);

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
      method: 'basic-extraction'
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
