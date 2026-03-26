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
        const { userDesc } = req.body;

        // 1. Busca o catálogo via HTTP para máxima segurança na Vercel
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host;
        let catalogData = [];
        
        try {
            const catalogResponse = await fetch(`${protocol}://${host}/catalog.json`);
            if (catalogResponse.ok) {
                catalogData = await catalogResponse.json();
            }
        } catch (fetchErr) {
            console.error("Erro ao buscar catálogo via HTTP:", fetchErr);
        }

        // 2. Pré-filtro Semântico (Mini-RAG): Extração de palavras-chave
        const cleanPrompt = (userDesc || "").toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
            .replace(/[^\w\s]/gi, ''); // Remove pontuação
        
        const stopWords = ['o', 'a', 'os', 'as', 'de', 'da', 'do', 'em', 'para', 'com', 'um', 'uma', 'e', 'que', 'do', 'da', 'no', 'na'];
        const keywords = cleanPrompt.split(/\s+/).filter(word => word.length > 2 && !stopWords.includes(word));

        // 3. Score de relevância
        let scoredProducts = catalogData.map(item => {
            let score = 0;
            const name = (item.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const category = (item.category || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const description = (item.description || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            keywords.forEach(kw => {
                if (name.includes(kw)) score += 10;
                if (category.includes(kw)) score += 5;
                if (description.includes(kw)) score += 2;
            });

            return { ...item, score };
        });

        // 4. Seleção dos top 15 (ou aleatórios se score for 0)
        scoredProducts.sort((a, b) => b.score - a.score);
        let topProducts = scoredProducts.slice(0, 15);
        
        // Se nenhum bateu, pegamos 15 aleatórios para manter a IA criativa
        if (topProducts[0]?.score === 0) {
            topProducts = catalogData.sort(() => 0.5 - Math.random()).slice(0, 15);
        }

        // 5. Redução Drástica de Payload (Objeto Mínimo)
        const minimalCatalog = topProducts.map(p => ({
            id: p.id,
            nome: p.name,
            categoria: p.category,
            detalhes: p.description
        }));

        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Uso de model-config para garantir resposta JSON pura (Schema Enforcement)
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-2.5-flash',
            generationConfig: { responseMimeType: 'application/json' }
        });
        
        const systemPrompt = `Atue como um designer de interiores da Cepel Arte Decore. O cliente pediu: '${userDesc || "Gostaria de renovar meu ambiente."}'. 

Baseado EXCLUSIVAMENTE nesta lista de produtos disponíveis em nosso estoque:
${JSON.stringify(minimalCatalog)}

REGRAS ABSOLUTAS:
1. Crie uma recomendação curta, aconchegante e vendedora sugerindo no máximo 3 itens.
2. Forneça exatamente 2 dicas de decoração extremamente sucintas, profissionais e persuasivas.
3. NUNCA finalize com uma pergunta. Sempre termine o texto com uma forte Chamada para Ação (CTA) persuasiva e direta, incentivando a compra imediata. Convide o cliente a adicionar o produto ao carrinho agora mesmo.
4. Sua resposta completa em texto deve ter no máximo 250 caracteres. Seja extremamente conciso e direto.
5. NUNCA mencione preços ou valores nas suas respostas. O foco é vender o design e convidar o cliente para o WhatsApp para consultar os valores.

Você deve responder OBRIGATORIAMENTE no formato JSON abaixo:
{
  "texto_dica": "Seu texto com as 2 dicas e a CTA final de fechamento.",
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
            texto_dica: aiResponse.texto_dica || "Confira nossas opÃ§Ãµes no catÃ¡logo!",
            produto_recommended_id: aiResponse.produto_recommended_id
        };
        
        res.status(200).json(finalResponse);
        
    } catch (e) {
        console.error("Erro CrÃ­tico no Chat API:", e);
        res.status(500).json({ error: 'Erro de processamento', detalhes: e.message });
    }
};