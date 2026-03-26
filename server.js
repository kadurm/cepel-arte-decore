require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const { updateProductImage, updateProductTexts, syncEstoqueToBaseFotos, clientEmail, privateKey } = require('./googleSheets');
const { syncCatalog } = require('./scripts/sync');

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
app.use(cors({ origin: '*' }));
app.use(express.json());

// Configuração do Multer (Armazenamento em memória)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Rota de Teste Base
app.get('/', (req, res) => {
    res.json({ message: "Backend do Admin Cepel está rodando!" });
});

/**
 * ROTA: Lista produtos para o admin (com todos os campos)
 */
app.get('/api/products', (req, res) => {
    // Cache-busting agressivo: Impedir cache de borda e de navegador
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try {
        const fs = require('fs');
        const path = require('path');
        const catalogPath = path.resolve(__dirname, 'catalog.json');

        if (!fs.existsSync(catalogPath)) {
            return res.json([]);
        }

        // Forçar leitura do arquivo físico (sem cache de require)
        const fileContent = fs.readFileSync(catalogPath, 'utf-8');
        const catalog = JSON.parse(fileContent);

        // Retorna id, name (Nome Comercial), description (Detalhes), image e erpDescription (bruta)
        const products = catalog.map(p => ({
            id: p.id,
            name: p.name || '',
            description: p.description || '',
            image: p.image || '',
            erpDescription: p.erpDescription || ''
        }));

        res.json(products);
    } catch (error) {
        console.error('[ERRO /api/products]', error.message);
        res.status(500).json({ error: 'Erro ao carregar catálogo' });
    }
});

/**
 * ROTA: Atualiza textos do produto (Nome Comercial e Detalhes)
 */
app.put('/api/update-product-texts', async (req, res) => {
    try {
        const { id, name, description } = req.body;

        if (!id) {
            return res.status(400).json({ error: "O ID do produto é obrigatório." });
        }

        console.log(`[PUT /api/update-product-texts] Atualizando textos para o produto: ${id}`);
        
        await updateProductTexts(id, name, description);

        // LIVE SYNC: Atualizar catálogo local imediatamente
        console.log(`[LIVE SYNC] Forçando atualização do catalog.json...`);
        try {
            await syncCatalog();
            console.log(`[LIVE SYNC] Catálogo sincronizado com sucesso.`);
        } catch (e) {
            console.error("[ERRO LIVE SYNC]", e);
        }

        return res.status(200).json({
            success: true,
            synced: true,
            message: "Textos do produto atualizados e publicados no site com sucesso!",
            productId: id
        });
    } catch (error) {
        console.error("[ERRO UPDATE TEXTS]", error);
        return res.status(500).json({
            error: error.message || "Erro ao atualizar textos do produto."
        });
    }
});

/**
 * ROTA: Sincroniza ERP com Base_Estoque e faz append de novos na Base_Fotos
 * Recebe: array de produtos no body
 */
app.post('/api/sync-erp', async (req, res) => {
    try {
        const importedProducts = req.body;

        if (!Array.isArray(importedProducts) || importedProducts.length === 0) {
            return res.status(400).json({ error: "Dados do ERP devem ser um array não vazio." });
        }

        console.log(`[POST /api/sync-erp] Recebidos ${importedProducts.length} produtos do ERP.`);

        // 1. Atualizar Base_Estoque (sobrescrever integralmente)
        const { GoogleSpreadsheet } = require('google-spreadsheet');
        const { JWT } = require('google-auth-library');

        const serviceAccountAuth = new JWT({
            email: clientEmail,
            key: privateKey,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo();

        const sheetEstoque = doc.sheetsByTitle['Base de Estoque'] || doc.sheetsByIndex[0];

        // Limpar Base_Estoque atual
        const estoqueRows = await sheetEstoque.getRows();
        for (const row of estoqueRows) {
            await row.delete();
        }

        // Recriar cabeçalhos
        const headers = ['Código', 'Categoria', 'Nome Comercial', 'Descrição', 'Foto'];
        await sheetEstoque.setHeader(headers);

        // Inserir todos os produtos importados
        for (const product of importedProducts) {
            await sheetEstoque.addRow({
                'Código': product.id,
                'Categoria': product.category,
                'Nome Comercial': product.name,
                'Descrição': product.description,
                'Foto': product.image || ''
            });
        }

        console.log(`[Google Sheets] Base_Estoque sobrescrita com ${importedProducts.length} produtos.`);

        // 2. Varredura cruzada e append na Base_Fotos
        const result = await syncEstoqueToBaseFotos(importedProducts);

        return res.status(200).json({
            success: true,
            message: `Base_Estoque atualizada. ${result.added} produtos inéditos adicionados à Base_Fotos.`,
            estoqueCount: importedProducts.length,
            fotosAdded: result.added
        });

    } catch (error) {
        console.error("[ERRO /api/sync-erp]", {
            message: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            error: error.message || "Erro ao sincronizar com Google Sheets."
        });
    }
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

        // LIVE SYNC: Atualizar catálogo local imediatamente
        console.log(`[LIVE SYNC] Forçando atualização do catalog.json...`);
        try {
            await syncCatalog();
            console.log(`[LIVE SYNC] Catálogo sincronizado com sucesso.`);
        } catch (e) {
            console.error("[ERRO LIVE SYNC]", e);
        }

        return res.status(200).json({
            success: true,
            synced: true,
            message: "Imagem enviada e produto publicado no site com sucesso!",
            productId: productId,
            imageUrl: uploadResult.secure_url
        });

    } catch (error) {
        console.error("[ERRO UPLOAD]", {
            message: error.message,
            stack: error.stack,
            code: error.code,
            reason: error.reason
        });
        return res.status(500).json({
            error: error.message || "Erro interno no servidor ao processar o upload para a nuvem/planilha.",
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Inicializar Servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor Backend iniciado na porta ${PORT}`);
    console.log(`✅ Aceitando conexões em http://localhost:${PORT}`);
});
