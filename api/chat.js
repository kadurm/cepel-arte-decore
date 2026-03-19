const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Erro' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Chave ausente' });

    try {
        const { userDesc, catalogData } = req.body;
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `Consultor Cepel Arte Decore. Regras: 1. Dê 2 dicas sucintas. 2. Nunca finalize os textos com afirmações e sim perguntas. O vendedor quem guia a conversa. 3. Escolha 1 produto de: ${catalogData}. Responda em JSON: { "texto_dica": "sua dica", "produto_recomendado_id": "ID_DO_PRODUTO" }`;

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: userDesc }] }],
            systemInstruction: { parts: [{ text: prompt }] },
            generationConfig: { responseMimeType: 'application/json' }
        });

        res.status(200).json(JSON.parse(result.response.text()));
    } catch (e) {
        res.status(500).json({ error: 'Falha IA' });
    }
};
