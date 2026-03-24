const fs = require('fs');
const path = require('path');

const URL_SISTEMA = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQLTque66KreUWBmSGy9il2uB-fTZOZWwERvgZPvfvDjrSNHyP064Y0EobrJ-ecfIgDcZm_DTdKZpAx/pub?gid=2101023602&single=true&output=csv";
const URL_MARKETING = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTeE1RFjw_Tmg6gaeWmljnczLFn2DRQ_-K5I2S_r9TrwjMVLfK2q2i1SmZWDlljrcbN2ARromneUxf6/pub?gid=2101023602&single=true&output=csv";

function parseCSV(text) {
    const result = [];
    let row = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (i + 1 < text.length && text[i + 1] === '"') {
                    cell += '"';
                    i++; 
                } else {
                    inQuotes = false;
                }
            } else {
                cell += c;
            }
        } else {
            if (c === '"') {
                inQuotes = true;
            } else if (c === ',') {
                row.push(cell);
                cell = '';
            } else if (c === '\n' || c === '\r') {
                if (c === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
                    i++;
                }
                row.push(cell);
                result.push(row);
                row = [];
                cell = '';
            } else {
                cell += c;
            }
        }
    }
    row.push(cell);
    if (row.some(c => c !== '')) result.push(row);

    if (result.length === 0) return [];
    
    const headers = result[0].map(h => h.replace(/^\uFEFF/, '').trim());
    return result.slice(1).map(r => {
        const obj = {};
        headers.forEach((h, idx) => {
            obj[h] = r[idx] !== undefined ? r[idx].trim() : "";
        });
        return obj;
    });
}

async function syncCatalog() {
    console.log("Iniciando sincronização de catálogos via Google Sheets...");
    
    try {
        const [resSistema, resMarketing] = await Promise.all([
            fetch(URL_SISTEMA),
            fetch(URL_MARKETING)
        ]);

        if (!resSistema.ok || !resMarketing.ok) {
            throw new Error("Erro ao fazer o fetch das planilhas.");
        }

        const csvSistema = await resSistema.text();
        const csvMarketing = await resMarketing.text();

        const dadosSistema = parseCSV(csvSistema);
        const dadosMarketing = parseCSV(csvMarketing);

        // Processamento em lotes (Proteção de Memória) - isolando categorias
        const categoriasUnicas = [...new Set(dadosSistema.map(item => item['Categoria']).filter(c => c))];
        console.log(`Total de categorias a processar em lotes: ${categoriasUnicas.length}`);
        
        const catalogoFinal = [];

        // Estrutura solicitada: loop para processamento em batch
        for (const categoria of categoriasUnicas) {
            const itensCategoriaSistema = dadosSistema.filter(item => item['Categoria'] === categoria);
            
            // Lógica de JOIN
            for (const itemSistema of itensCategoriaSistema) {
                const codProduto = itemSistema['Código Produto'];
                if (!codProduto) continue;

                // Busca dados de marketing
                const itemMarketing = dadosMarketing.find(m => m['Código Produto'] === codProduto);

                if (itemMarketing) {
                    catalogoFinal.push({
                        id: codProduto,
                        category: itemSistema['Categoria'] || categoria,
                        name: itemMarketing['Nome Comercial'] || "",
                        description: itemMarketing['Detalhes'] || "",
                        image: itemMarketing['Foto'] || ""
                    });
                }
            }
        }

        const outputPath = path.join(__dirname, '..', 'catalog.json');
        fs.writeFileSync(outputPath, JSON.stringify(catalogoFinal, null, 2), 'utf-8');
        console.log(`Sucesso na automação: ${catalogoFinal.length} produtos mesclados e sincronizados com êxito!`);
    } catch (error) {
        console.error("Falha ao sincronizar:", error);
        process.exit(1);
    }
}

syncCatalog();
