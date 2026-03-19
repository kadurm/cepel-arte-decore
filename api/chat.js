const { GoogleGenerativeAI } = require('@google/generative-ai');
module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método inválido' });
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Chave ausente no Vercel' });
    
    try {
        const { userDesc, catalogData } = req.body;
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        
        const prompt = `Consultor Cepel Arte Decore. Regras: 1. Dê 2 dicas sucintas. 2. Nunca finalize os textos com afirmações e sim perguntas. O vendedor quem guia a conversa. 3. Escolha 1 produto de: ${catalogData}. Responda OBRIGATORIAMENTE em formato JSON válido, usando apenas as chaves: { "texto_dica": "sua dica", "produto_recomendado_id": "ID_DO_PRODUTO" }`;
        
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: userDesc || "Preciso de um móvel" }] }],
            systemInstruction: { parts: [{ text: prompt }] }
        });
        
        let rawText = result.response.text();
        
        // Limpeza extrema: Remove formatações indesejadas que o Google costuma enviar
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        res.status(200).json(JSON.parse(rawText));
        
    } catch (e) {
        res.status(500).json({ error: 'Erro de comunicação', detalhes: e.message });
    }
};
