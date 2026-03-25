const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

/**
 * Conecta-se à API do Google Sheets e atualiza a célula da Imagem do produto específico.
 * @param {string} productId - O Código/ID do produto
 * @param {string} imageUrl - A URL segura HTTPS do Cloudinary
 */
async function updateProductImage(productId, imageUrl) {
    try {
        // 0. Validação das credenciais
        if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_SPREADSHEET_ID) {
            throw new Error('Credenciais do Google Sheets não estão configuradas no .env');
        }

        // 1. Reconstrutor Nuclear PEM (RFC 7468 - OpenSSL 3.0 Strict Mode)
        const getSanitizedPrivateKey = () => {
            let key = process.env.GOOGLE_PRIVATE_KEY || '';
            // 1. Remove qualquer aspa ou barra invertida literal
            key = key.replace(/["']/g, '').replace(/\\n/g, '\n');
            // 2. Arranca os cabeçalhos para isolar o hash puro
            key = key.replace(/-----BEGIN PRIVATE KEY-----/ig, '');
            key = key.replace(/-----END PRIVATE KEY-----/ig, '');
            // 3. Remove TODOS os espaços, quebras de linha e sujeiras invisíveis
            key = key.replace(/\s+/g, '');
            // 4. Reconstrói perfeitamente em blocos exatos de 64 caracteres (Padrão PEM estrito)
            const match = key.match(/.{1,64}/g);
            if (match) {
                return `-----BEGIN PRIVATE KEY-----\n${match.join('\n')}\n-----END PRIVATE KEY-----\n`;
            }
            return '';
        };
        const privateKey = getSanitizedPrivateKey();

        // Debug de diagnóstico do PEM reconstruído
        console.log("=== DEBUG RECONSTRUTOR PEM ===");
        console.log("Inicio correto?", privateKey.startsWith('-----BEGIN PRIVATE KEY-----'));
        console.log("Fim correto?", privateKey.trim().endsWith('-----END PRIVATE KEY-----'));
        console.log("Tamanho:", privateKey.length);
        console.log("=============================");

        // Debug seguro
        console.log(`[Google Sheets] Service Account: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`);

        // 2. Autenticação via JWT usando Service Account
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
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

module.exports = { updateProductImage };
