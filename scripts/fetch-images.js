const fs = require('fs');
const path = require('path');
const google = require('googlethis');

// Utilitário para o timeout (Rate Limiting)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função Sanitizadora
function cleanSearchTerm(name) {
  if (!name) return '';
  let cleaned = name.toString();
  
  // Substituir C/ ou c/ por Com
  cleaned = cleaned.replace(/[cC]\//g, 'Com ');
  
  // Remover sequências de pontos
  cleaned = cleaned.replace(/\.+/g, ' ');
  
  // Remover códigos numéricos soltos no início (ex: "10126 ")
  cleaned = cleaned.replace(/^\s*\d+\s+/, '');
  
  // Substituir barras e traços por espaços
  cleaned = cleaned.replace(/[/-]/g, ' ');
  
  // Limpar espaços múltiplos
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Deixar em Title Case (Primeira letra maiúscula)
  cleaned = cleaned.toLowerCase().split(' ').map(word => {
    if (word.length === 0) return '';
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');

  return cleaned;
}

async function main() {
  const rootDir = path.join(__dirname, '..');
  const catalogPath = path.join(rootDir, 'catalog.json');
  const csvPath = path.join(rootDir, 'novas_fotos.csv');

  // Lendo o catálogo
  if (!fs.existsSync(catalogPath)) {
    console.error(`ERRO: O arquivo catalog.json não foi encontrado em: ${catalogPath}`);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

  // 1. LÓGICA DE ARQUIVO & 2. MEMÓRIA DE ESTADO: 
  const processedIds = new Set();
  
  if (fs.existsSync(csvPath)) {
    // Lendo o CSV para extrair quais códigos já processamos
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n');
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // O formato salvo é: "Código","URL"
      const firstQuoteIdx = line.indexOf('"');
      const secondQuoteIdx = line.indexOf('"', firstQuoteIdx + 1);
      
      if (firstQuoteIdx !== -1 && secondQuoteIdx !== -1) {
         let idString = line.substring(firstQuoteIdx + 1, secondQuoteIdx);
         idString = idString.replace(/""/g, '"');
         processedIds.add(String(idString));
      }
    }
    console.log(`[Resume] Arquivo CSV detectado com ${processedIds.size} itens já processados. Eles serão ignorados no loop.\n`);
  } else {
    // Se não existir, criamos o arquivo CSV apenas com o cabeçalho
    console.log(`[Start] Iniciando nova busca do zero...\n`);
    fs.writeFileSync(csvPath, '\uFEFF"Código Produto","URL Foto Encontrada"\n', 'utf8');
  }

  // Filtrando os itens cujo campo 'image' está vazio ou inexistente
  const itemsWithoutImage = catalog.filter(item => {
    return !item.image || item.image.trim() === '';
  });

  console.log('=============================================');
  console.log(`Total de produtos no catálogo: ${catalog.length}`);
  console.log(`Produtos sem imagem: ${itemsWithoutImage.length}`);
  console.log('=============================================\n');

  if (itemsWithoutImage.length === 0) {
    console.log('Tudo certo! Todos os produtos já possuem imagem.');
    return;
  }

  // Fazendo as buscas web com intervalo de segurança
  for (let i = 0; i < itemsWithoutImage.length; i++) {
    const item = itemsWithoutImage[i];

    // 3. PULO INTELIGENTE (Skip): Se já processou, vá para o próximo.
    if (processedIds.has(String(item.id))) {
      console.log(`[${i + 1}/${itemsWithoutImage.length}] Código: ${item.id} -> Já processado anteriormente. Pulando...`);
      continue;
    }
    
    // Aplicando Função Sanitizadora
    const cleanedName = cleanSearchTerm(item.name);
    const categoria = item.category || '';
    
    // Enriquecimento de Query
    const searchTerm = `${cleanedName} ${categoria} móveis decoração fundo branco alta resolução`.trim();

    console.log(`[${i + 1}/${itemsWithoutImage.length}] Código: ${item.id} | Buscando: "${searchTerm}"`);

    try {
      // Fazendo a pesquisa na aba de imagens
      const images = await google.image(searchTerm, { safe: false });
      
      let finalUrl = null;

      if (images && images.length > 0) {
        // Alfândega de URL (Validação Estrita) e Filtro de Lixo
        const strictRegex = /\.(jpg|jpeg|png|webp)(\?.*)?$/i;
        const trashRegex = /(icon|thumbnail|avatar|logo|base64)/i;

        const validImage = images.find(img => {
           const url = img.url;
           return strictRegex.test(url) && !trashRegex.test(url);
        });

        // Só aceita a imagem se passou na alfândega estrita
        if (validImage) {
            finalUrl = validImage.url;
        }
      }

      if (finalUrl) {
        console.log(`   -> OK: ${finalUrl}`);
        
        // NOVO: INJEÇÃO DIRETA no catalog.json
        item.image = finalUrl; // Atualiza o objeto referenciado
        fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8'); // Salva fisicamente

        // Tratando strings para aspas duplas de CSV
        const cleanId = item.id ? String(item.id).replace(/"/g, '""') : '';
        const cleanUrl = finalUrl.replace(/"/g, '""');
        
        // Mantém o append no CSV como backup/log de segurança
        fs.appendFileSync(csvPath, `"${cleanId}","${cleanUrl}"\n`, 'utf8');
      } else {
        console.log(`   -> AVISO: Nenhuma imagem passou na validação estrita.`);
      }

    } catch (error) {
      console.error(`   -> ERRO na busca:`, error.message);
    }

    // Rate Limiting: Delay randômico entre 3 a 5 segundos
    const waitTime = Math.floor(Math.random() * 2000) + 3000; 
    console.log(`   ⏳ Aguardando ${waitTime}ms...\n`);
    await delay(waitTime);
  }

  console.log(`\n=============================================`);
  console.log(`Processo finalizado com sucesso!`);
  console.log(`Foram procuradas fotos para ${itemsWithoutImage.length} produtos.`);
  console.log(`O resultado foi exportado para: ${csvPath} e atualizado no catalog.json diretamente.`);
  console.log(`=============================================`);
}

main();
