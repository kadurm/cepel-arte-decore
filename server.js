require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');

// Inicialização
const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Configuração do Multer (Armazenamento em memória)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Rota de Teste Base
app.get('/', (req, res) => {
    res.json({ message: "Backend do Admin Cepel está rodando!" });
});

/**
 * ROTA DE UPLOAD (A Recepção)
 * Recebe: arquivo em 'image', string em 'productId'
 */
app.post('/api/upload', upload.single('image'), (req, res) => {
    try {
        const file = req.file;
        const productId = req.body.productId;

        if (!file) {
            return res.status(400).json({ error: "Nenhuma imagem foi enviada." });
        }
        if (!productId) {
            return res.status(400).json({ error: "O ID do produto (productId) é obrigatório." });
        }

        console.log(`[POST /api/upload] Imagem recebida para o produto: ${productId}`);
        console.log(`[INFO] Array de bytes em memória: ${file.size} bytes (${file.mimetype})`);

        // Simulação do sucesso para enviar dados à nuvem posteriormente
        return res.status(200).json({
            success: true,
            message: "Imagem recebida com sucesso, pronta para nuvem",
            productId: productId,
            size: file.size,
            mimetype: file.mimetype
        });

    } catch (error) {
        console.error("[ERRO UPLOAD]", error);
        return res.status(500).json({ error: "Erro interno no servidor ao processar o upload." });
    }
});

// Inicializar Servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor Backend iniciado na porta ${PORT}`);
    console.log(`✅ Aceitando conexões em http://localhost:${PORT}`);
});
