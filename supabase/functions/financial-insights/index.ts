import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { alertMetrics } = await req.json()
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY")

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "Gemini API key is not configured in Supabase Secrets." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const prompt = `
Você é o MykaCash AI, um consultor financeiro de elite especializado em fluxo de caixa e antecipação de recebíveis.
Analise as seguintes métricas financeiras de uma empresa e redija três diagnósticos profundos e acionáveis, em português (PT-BR).

MÉTRICAS FINANCEIRAS ATUAIS:
- Score de Saúde Financeira: ${alertMetrics.scoreNumeric}/100 (Nota: ${alertMetrics.healthScore}, Nível de Risco: ${alertMetrics.riskLevel})
- Saldo Bruto em Aberto (Dívida de Antecipação): ${alertMetrics.totalDebt} (Formatado em BRL)
- Velocidade Diária de Antecipação: ${alertMetrics.dailySpeed}/dia útil (Formatado em BRL)
- Prazo Estimado para Zerar a Posição: ${alertMetrics.daysToClear} dias úteis
- Índice de Rolagem de Recebíveis (Re-empréstimo): ${alertMetrics.rolloverRate}%
- Volume Total Captado: ${alertMetrics.totalBorrowed} (Formatado em BRL)
- Volume Total Liquidado de Fato: ${alertMetrics.totalSettled} (Formatado em BRL)
- Taxa Efetiva Média de Juros: ${alertMetrics.effectiveRate}%
- Volume Projetado de Antecipação para os Próximos 30 dias: ${alertMetrics.monthlyAnticipationVolume} (Formatado em BRL)
- Juros Projetados Diretos (30 dias): ${alertMetrics.projectedInterest30d} (Formatado em BRL)
- Compromisso de Receita Mensal: ${alertMetrics.cashCommitmentPct}%
- Custo de Antecipação Anual Projetado: ${alertMetrics.projectedInterest1y} (Formatado em BRL)
- Economia Anual Gerada (MykaCash vs Factoring comum): ${alertMetrics.annualSavingsProjected} (Formatado em BRL)

REQUISITOS IMPORTANTES:
1. Re-escreva os textos COMPLETAMENTE. Não utilize estruturas de frases prontas ou clichês corporativos. Crie insights novos adequados a essas métricas específicas.
2. Evite repetir os mesmos valores numéricos exaustivamente no texto. Foque no significado de negócios dos dados (ex: se o índice de rolagem é alto, aborde o perigo do efeito bola de neve; se a velocidade é alta, fale sobre o consumo de receitas futuras).
3. Seja direto, estratégico, consultivo e use uma linguagem sofisticada.
4. Mantenha os parágrafos objetivos (máximo de 3 a 4 linhas por parágrafo).

Você DEVE retornar a resposta EXCLUSIVAMENTE como um objeto JSON válido, contendo as três chaves a seguir:
- dailySpeedText: Um diagnóstico integrado sobre a velocidade diária de captação, o saldo em aberto acumulado, os dias para zerar a posição e o índice de rolagem (re-empréstimo). Explique o impacto operacional disso no curto prazo.
- monthlyProjectionText: Um insight focado nos próximos 30 dias, avaliando o volume de antecipações projetado, a perda de caixa líquido para juros diretos e o percentual de comprometimento da receita. Dê orientações práticas.
- annualVisionText: Uma visão em escala anual que analisa o custo de antecipação projetado de 1 ano frente à economia anual gerada pelo MykaCash. Faça um balanço sobre a saúde de longo prazo.

Responda apenas com o JSON. Não inclua blocos de código com markdown como \`\`\`json.
`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      }
    )

    const result = await response.json()
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text

    if (!responseText) {
      throw new Error("Empty response from Gemini API")
    }

    // A resposta deve vir como um JSON no formato especificado
    const parsedData = JSON.parse(responseText.trim())

    return new Response(
      JSON.stringify(parsedData),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
