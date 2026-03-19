const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
    // ConfiguraÃ§Ã£o de CORS para Vercel Serverless
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'MÃ©todo invÃ¡lido' });
    }
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'ConfiguraÃ§Ã£o ausente', detalhes: 'GEMINI_API_KEY nÃ£o encontrada no ambiente Vercel.' });
    }
    
    try {
        const { userDesc, catalogData } = req.body;
        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Uso de model-config para garantir resposta JSON pura (Schema Enforcement)
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-1.5-flash-latest',
            generationConfig: { responseMimeType: 'application/json' }
        });
        
        const systemPrompt = `VocÃª Ã© um consultor e designer de interiores de alto padrÃ£o da loja 'Cepel Arte Decore'. 
Seu objetivo Ã© vender os produtos do catÃ¡logo apresentando dicas de design elegantes.

REGRAS ABSOLUTAS:
1. ForneÃ§a exatamente 2 dicas de decoraÃ§Ã£o extremamente sucintas, profissionais e persuasivas.
2. NUNCA finalize os seus textos com afirmaÃ§Ãµes. Sempre termine com uma PERGUNTA instigante que guie o cliente para o atendimento (O vendedor Ã© quem guia a conversa).
3. Analise o catÃ¡logo abaixo e escolha obrigatoriamente 1 (um) produto que melhor se encaixe na descriÃ§Ã£o do cliente.

CATÃLOGO ATUAL:
${catalogData}

VocÃª deve responder OBRIGATORIAMENTE no formato JSON abaixo:
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
            texto_dica: aiResponse.texto_dica || aiResponse.dica || "Confira nossas opÃ§Ãµes no catÃ¡logo!",
            produto_recomendado_id: aiResponse.produto_recommended_id || aiResponse.produto_id || aiResponse.produto_recomendado_id
        };
        
        res.status(200).json(finalResponse);
        
    } catch (e) {
        console.error("Erro CrÃ­tico no Chat API:", e);
        res.status(500).json({ error: 'Erro de processamento', detalhes: e.message });
    }
};
