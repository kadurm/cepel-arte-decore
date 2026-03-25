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

        // 1. Funcao blindada de sanitizacao da chave RSA (fix para ERR_OSSL_UNSUPPORTED)
        const getSanitizedPrivateKey = () => {
            let key = process.env.GOOGLE_PRIVATE_KEY || '';
            // 1. Remove aspas apenas do inicio e fim
            key = key.replace(/^"|"$/g, '');
            // 2. Resolve double-escaped slashes e escaped normais
            key = key.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');
            // 3. Limpa carriage returns (padrao Windows) que quebram o OpenSSL
            key = key.replace(/\r/g, '');

            // LOG DE DIAGNOSTICO (Nao expoe a chave inteira, apenas a estrutura)
            console.log("=== DEBUG DA CHAVE RSA ===");
            console.log("Inicio correto?", key.startsWith('-----BEGIN PRIVATE KEY-----'));
            console.log("Fim correto?", key.trim().endsWith('-----END PRIVATE KEY-----'));
            console.log("Tem quebras de linha reais?", key.includes('\n'));
            console.log("Tamanho da string:", key.length);
            console.log("=========================");

            return key.trim();
        };
        const privateKey = getSanitizedPrivateKey();

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
