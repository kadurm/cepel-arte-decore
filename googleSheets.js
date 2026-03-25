const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const getAuthCredentials = () => {
    if (process.env.GOOGLE_CREDENTIALS_BASE64) {
        try {
            const decodedJson = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8');
            const creds = JSON.parse(decodedJson);
            console.log("[Google Sheets] Credenciais Base64 decodificadas com sucesso absoluto.");
            return { clientEmail: creds.client_email, privateKey: creds.private_key };
        } catch (e) {
            console.error("[Google Sheets ERRO] Falha ao decodificar Base64:", e.message);
        }
    }
    // Fallback original
    return {
        clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    };
};

const { clientEmail, privateKey } = getAuthCredentials();

/**
 * Conecta-se à API do Google Sheets e atualiza a célula da Imagem do produto específico.
 * @param {string} productId - O Código/ID do produto
 * @param {string} imageUrl - A URL segura HTTPS do Cloudinary
 */
async function updateProductImage(productId, imageUrl) {
    try {
        // 0. Validação das credenciais
        if (!clientEmail || !privateKey) {
            throw new Error('As credenciais do Google Sheets (JSON) não foram resolvidas.');
        }
        if (!process.env.GOOGLE_SPREADSHEET_ID) {
            throw new Error('O ID da planilha (GOOGLE_SPREADSHEET_ID) não está configurado.');
        }

        console.log(`[Google Sheets] Service Account: ${clientEmail}`);

        // 2. Autenticação via JWT usando Service Account
        const serviceAccountAuth = new JWT({
            email: clientEmail,
            key: privateKey,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        // 2. Instanciando o Documento e carregando os dados principais
        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo(); 
        
        console.log(`[Google Sheets] Conectado na planilha: "${doc.title}"`);

        // 3. Obtendo a aba correta (Tenta pelo nome inteligente, senão cai na primeira aba principal)
        const sheet = doc.sheetsByTitle['Base de Fotos'] || doc.sheetsByTitle['Base de Estoque'] || doc.sheetsByIndex[0];
        
        console.log(`[Google Sheets] Acessando a aba: "${sheet.title}"`);

        // 4. Lendo todas as linhas
        const rows = await sheet.getRows();

        // 5. Analisando o cabeçalho para descobrir as colunas reais (pois os nomes variam)
        const headers = sheet.headerValues;
        let codeCol = headers.find(h => ['id', 'cód', 'código', 'codigo', 'sku', 'referência'].includes(h.toLowerCase()));
        let imgCol = headers.find(h => ['image', 'imagem', 'foto', 'url', 'link da imagem', 'url da imagem'].includes(h.toLowerCase()));

        // Fallbacks caso ele tenha digitado nomes muito estranhos
        if (!codeCol) codeCol = headers[0]; 
        if (!imgCol) throw new Error('A planilha não possui uma coluna identificável para a "Imagem" ou "Foto". Por favor, nomeie uma das colunas assim.');

        console.log(`[Google Sheets] Mapeamento -> Coluna Código: "${codeCol}", Coluna Imagem: "${imgCol}"`);

        // 6. Varrendo a coluna até achar o Produto Exato
        let targetRow = null;
        for (let row of rows) {
            // Conversão para string para garantir '123' == 123
            if (String(row.get(codeCol)).trim() === String(productId).trim()) {
                targetRow = row;
                break;
            }
        }

        if (!targetRow) {
            throw new Error(`O Produto com código "${productId}" não foi encontrado na planilha e não pôde ser atualizado.`);
        }

        // 7. Atualizando a célula ESTRITAMENTE da coluna da imagem e salvando a linha!
        targetRow.set(imgCol, imageUrl);
        await targetRow.save();
        
        console.log(`[Google Sheets] SUCESSO! Célula do produto "${productId}" atualizada para: ${imageUrl}`);
        return true;

    } catch (error) {
        console.error('[Google Sheets ERRO]', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            reason: error.reason
        });
        throw error; // Repassa pro server.js saber que parou
    }
}

/**
 * Sincroniza novos produtos da Base_Estoque para a Base_Fotos (append seletivo).
 * Preserva dados existentes (Nome Comercial, Detalhes, Foto) e mapeia apenas a Descrição bruta do ERP.
 * @param {Array} importedProducts - Lista de produtos importados do ERP
 */
async function syncEstoqueToBaseFotos(importedProducts) {
    try {
        // 0. Validação das credenciais
        if (!clientEmail || !privateKey) {
            throw new Error('As credenciais do Google Sheets (JSON) não foram resolvidas.');
        }
        if (!process.env.GOOGLE_SPREADSHEET_ID) {
            throw new Error('O ID da planilha (GOOGLE_SPREADSHEET_ID) não está configurado.');
        }

        // 1. Autenticação via JWT usando Service Account
        const serviceAccountAuth = new JWT({
            email: clientEmail,
            key: privateKey,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        // 2. Instanciando o Documento e carregando os dados principais
        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo();

        console.log(`[Google Sheets] Conectado na planilha: "${doc.title}"`);

        // 3. Acessando as abas Base_Estoque e Base_Fotos
        const sheetEstoque = doc.sheetsByTitle['Base de Estoque'] || doc.sheetsByIndex[0];
        const sheetFotos = doc.sheetsByTitle['Base de Fotos'];

        if (!sheetFotos) {
            throw new Error('A planilha não possui uma aba "Base de Fotos". Crie-a manualmente.');
        }

        console.log(`[Google Sheets] Base_Estoque: "${sheetEstoque.title}", Base_Fotos: "${sheetFotos.title}"`);

        // 4. Ler todos os códigos já existentes na Base_Fotos
        const fotosRows = await sheetFotos.getRows();
        const headersFotos = sheetFotos.headerValues;
        const codeColFotos = headersFotos.find(h => ['id', 'cód', 'código', 'codigo', 'sku', 'referência', 'Código'].some(k => k.toLowerCase().includes(h.toLowerCase())));

        if (!codeColFotos) {
            throw new Error('Base_Fotos não tem coluna de Código identificável.');
        }

        const existingCodes = new Set(fotosRows.map(row => String(row.get(codeColFotos)).trim()));
        console.log(`[Google Sheets] ${existingCodes.size} produtos já existem na Base_Fotos.`);

        // 5. Varredura cruzada: filtrar apenas produtos INÉDITOS na Base_Fotos
        const newProducts = importedProducts.filter(p => !existingCodes.has(String(p.id)));
        console.log(`[Google Sheets] ${newProducts.length} produtos inéditos para append na Base_Fotos.`);

        if (newProducts.length === 0) {
            console.log('[Google Sheets] Nenhum produto novo para adicionar na Base_Fotos.');
            return { added: 0 };
        }

        // 6. Mapear cabeçalhos da Base_Fotos
        const headersEstoque = sheetEstoque.headerValues;
        const codeColEstoque = headersEstoque.find(h => ['id', 'cód', 'código', 'codigo', 'sku', 'referência', 'Código'].some(k => k.toLowerCase().includes(h.toLowerCase())));
        const descColEstoque = headersEstoque.find(h => ['descrição', 'descricao', 'nome', 'produto', 'Descrição'].some(k => k.toLowerCase().includes(h.toLowerCase())));

        // Headers da Base_Fotos para escrita
        const headersFotosNormalized = headersFotos.map(h => h.toLowerCase().trim());
        const codigoIdx = headersFotosNormalized.findIndex(h => ['código', 'codigo', 'id', 'sku', 'referência'].includes(h));
        const descricaoIdx = headersFotosNormalized.findIndex(h => ['descrição', 'descricao'].includes(h));
        const nomeComercialIdx = headersFotosNormalized.findIndex(h => ['nome comercial', 'nomecomercial'].includes(h));
        const detalhesIdx = headersFotosNormalized.findIndex(h => ['detalhes', 'descricao detalhada'].includes(h));
        const fotoIdx = headersFotosNormalized.findIndex(h => ['foto', 'imagem', 'url', 'link'].includes(h));

        // 7. Append dos produtos inéditos
        for (const product of newProducts) {
            const rowData = [];
            rowData[codigoIdx] = product.id;
            rowData[descricaoIdx] = product.name; // Nome bruto do ERP vai para "Descrição"
            // Nome Comercial, Detalhes e Foto ficam VAZIOS
            await sheetFotos.addRow(rowData);
        }

        console.log(`[Google Sheets] Varredura concluída: ${newProducts.length} produtos inéditos injetados na Base de Fotos.`);
        return { added: newProducts.length };

    } catch (error) {
        console.error('[Google Sheets ERRO - syncEstoqueToBaseFotos]', {
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
}

module.exports = { updateProductImage, syncEstoqueToBaseFotos, clientEmail, privateKey };
