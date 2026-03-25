const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const getAuthCredentials = () => {
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
        try {
            const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
            console.log("[Google Sheets] Credenciais JSON parseadas com sucesso.");
            return {
                clientEmail: creds.client_email,
                privateKey: creds.private_key
            };
        } catch (e) {
            console.error("[Google Sheets ERRO] Falha no parse do JSON:", e.message);
        }
    }
    // Fallback para desenvolvimento local
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
        if (!clientEmail || !privateKey || !process.env.GOOGLE_SPREADSHEET_ID) {
            throw new Error('Credenciais do Google Sheets não estão configuradas no .env');
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

module.exports = { updateProductImage };
