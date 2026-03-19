const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
    // Configuração de CORS para Vercel Serverless
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método inválido' });
    }
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Configuração ausente', detalhes: 'GEMINI_API_KEY não encontrada no ambiente Vercel.' });
    }
    
    try {
        const { userDesc, catalogData } = req.body;
        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Uso de model-config para garantir resposta JSON pura (Schema Enforcement)
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-1.5-flash',
            generationConfig: { responseMimeType: 'application/json' }
        });
        
        const systemPrompt = `Você é um consultor e designer de interiores de alto padrão da loja 'Cepel Arte Decore'. 
Seu objetivo é vender os produtos do catálogo apresentando dicas de design elegantes.

REGRAS ABSOLUTAS:
1. Forneça exatamente 2 dicas de decoração extremamente sucintas, profissionais e persuasivas.
2. NUNCA finalize os seus textos com afirmações. Sempre termine com uma PERGUNTA instigante que guie o cliente para o atendimento (O vendedor é quem guia a conversa).
3. Analise o catálogo abaixo e escolha obrigatoriamente 1 (um) produto que melhor se encaixe na descrição do cliente.

CATÁLOGO ATUAL:
${catalogData}

Você deve responder OBRIGATORIAMENTE no formato JSON abaixo:
{
  "texto_dica": "Seu texto com as 2 dicas e a pergunta final de fechamento.",
  "produto_recommended_id": "ID_DO_PRODUTO"
}`;

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: userDesc || "Gostaria de renovar meu ambiente." }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        });
        
        const responseText = result.response.text();
        const aiResponse = JSON.parse(responseText);

        // Mapeamento defensivo: garante que o frontend receba o que espera
        const finalResponse = {
            texto_dica: aiResponse.texto_dica || aiResponse.dica || "Confira nossas opções no catálogo!",
            produto_recomendado_id: aiResponse.produto_recommended_id || aiResponse.produto_id || aiResponse.produto_recomendado_id
        };
        
        res.status(200).json(finalResponse);
        
    } catch (e) {
        console.error("Erro Crítico no Chat API:", e);
        res.status(500).json({ error: 'Erro de processamento', detalhes: e.message });
    }
};
