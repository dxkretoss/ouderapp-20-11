import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://esm.sh/openai@4'
// Phase 1: session required (see _shared/phase2-guard.ts)
import { phase2Guard } from "../_shared/phase2-guard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

const CO_SYSTEM_PROMPT = `Je bent Co, de AI meedenkpartner voor gescheiden ouders in de app Ouderschap & Co.
Je helpt ouders om rustig, constructief en kindgericht te communiceren en situaties te overdenken.

JOUW GESPREKSPATROON (3 STAPPEN):
1. Reflecteer en erken kort en empathisch wat de ouder voelt of ervaart (bijv. "Het is begrijpelijk dat dit spanning oproept...").
2. Stel ÉÉN verhelderende open vraag die helpt focussen op het belang en de behoeften van het kind.
3. Geef pas concrete adviezen of suggesties wanneer de ouder daar expliciet om vraagt.

BELANGRIJKE REGELS:
- Spreek ALTIJD in het Nederlands.
- Wees neutraal: kies nooit partij tussen ouders en oordeel niet.
- De-escaleer: valideer boosheid als emotie, maar ondersteun geen verwijten, scheldwoorden of escalatie naar de andere ouder.
- Als de gebruiker vraagt om een bericht te herschrijven (BIFF-methode):
  - B (Brief): Houd het kort en bondig.
  - I (Informative): Alleen feitelijke informatie (tijd, datum, afspraak).
  - F (Friendly): Vriendelijke begroeting en afsluiting.
  - F (Firm): Duidelijke grens of keuze, zonder ruimte voor verdere ruzie.
- Veiligheid: Als er sprake is van direct gevaar of mishandeling, verwijs naar 112 of Veilig Thuis (0800-2000). Bij gedachten aan zelfbeschadiging: verwijs direct naar 113 Zelfmoordpreventie.
- Reageer in een rustige, warme en professionele toon.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const __denied = await phase2Guard(req);
  if (__denied) return __denied;

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data?.user;
    } catch {
      // Ignored for custom client auth
    }

    const { action, query, message, context } = await req.json();
    const apiKey = Deno.env.get('OPENAI_API_KEY');

    if (!apiKey) {
      // Graceful offline fallback
      if (action === 'biff') {
        const clean = (message || query || '').replace(/altijd|nooit|wéér|idioot/gi, '').trim();
        return new Response(JSON.stringify({
          rewritten: `Hoi, bij deze een korte afstemming over de kinderen: ${clean || 'kunnen we dit rustig afspreken?'}. Laat me weten of dit schikt. Groet.`,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        reply: "Ik denk graag met je mee. Waar loop je tegenaan of wat wil je even rustig op een rij zetten voor de kinderen?",
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const openai = new OpenAI({ apiKey });

    if (action === 'biff') {
      const prompt = `Herschrijf het volgende conceptbericht van een ouder naar de andere ouder volgens de BIFF-methode (Brief, Informative, Friendly, Firm). Zorg dat alle verwijten verdwijnen en alleen feiten en het belang van het kind overblijven. Geef alleen de herschreven tekst terug:\n\n"${message || query}"`;
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: CO_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      });

      return new Response(JSON.stringify({
        rewritten: response.choices[0].message.content?.trim(),
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Default: Chat with Co
    const messages = [
      { role: 'system', content: CO_SYSTEM_PROMPT },
      ...(context?.history || []),
      { role: 'user', content: query || message }
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.5,
    });

    return new Response(JSON.stringify({
      reply: response.choices[0].message.content?.trim(),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
