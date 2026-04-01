// Supabase Edge Function - CORS Proxy pour le scraper EluConnect
// Déployez avec: npx supabase functions deploy cors-proxy

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url } = await req.json()
    
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'URL manquante' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate URL
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return new Response(JSON.stringify({ error: 'Protocole non supporté' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch the target URL from the server side (no CORS restrictions)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    })

    const contentType = response.headers.get('content-type') || 'text/html'
    
    // For binary content (PDFs), return as ArrayBuffer
    if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
      const buffer = await response.arrayBuffer()
      return new Response(buffer, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
        }
      })
    }

    // For text content (HTML), return as text
    const text = await response.text()
    return new Response(text, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
      }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
