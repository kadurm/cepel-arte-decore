require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const { updateProductImage } = require('./googleSheets');

// Configuração Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

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
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        const file = req.file;
        const productId = req.body.productId;

        if (!file) {
            return res.status(400).json({ error: "Nenhuma imagem foi enviada." });
        }
        if (!productId) {
            return res.status(400).json({ error: "O ID do produto (productId) é obrigatório." });
        }

        console.log(`[POST /api/upload] Processando imagem para o produto: ${productId}`);
        console.log(`[INFO] Buffer de ${file.size} bytes. Iniciando transferência para Cloudinary...`);

        // Upload streaming direto do Buffer da memória (sem gravar em disco)
        const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: 'cepel-catalogo' },
                (error, result) => {
                    if (result) {
                        resolve(result);
                    } else {
                        reject(error);
                    }
                }
            );
            streamifier.createReadStream(file.buffer).pipe(stream);
        });

        console.log(`[SUCESSO] Imagem hospedada com segurança em: ${uploadResult.secure_url}`);

        // Integração Google Sheets
        console.log(`[INFO] Sincronizando com a planilha mestra (Google Sheets)...`);
        await updateProductImage(productId, uploadResult.secure_url);

        return res.status(200).json({
            success: true,
            message: "Imagem enviada e Banco de Dados atualizado com sucesso!",
            productId: productId,
            imageUrl: uploadResult.secure_url
        });

    } catch (error) {
        console.error("[ERRO UPLOAD NUvem]", error);
        return res.status(500).json({ error: error.message || "Erro interno no servidor ao processar o upload para a nuvem/planilha." });
    }
});

// Inicializar Servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor Backend iniciado na porta ${PORT}`);
    console.log(`✅ Aceitando conexões em http://localhost:${PORT}`);
});
