const fs = require('fs');
const path = require('path');
const google = require('googlethis');

// Utilitário para o timeout (Rate Limiting)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 2. RESTAURAÇÃO DA BLINDAGEM (Sanitização)
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

// 1. ROTINA DE PURGA (Hard Reset)
function hardReset(catalogPath, csvPath) {
  console.log('--- [ROTINA DE PURGA: HARD RESET] ---');
  console.log('Limpando sujeira do teste anterior e imagens irrelevantes injetadas...');
  
  // Apaga ou zera o arquivo 'novas_fotos.csv' com cabeçalhos limpos
  fs.writeFileSync(csvPath, '\uFEFF"Código Produto","URL Foto Encontrada"\n', 'utf8');
  console.log(' > Arquivo novas_fotos.csv formatado/zerado com segurança.');

  // Leia o 'catalog.json' e force o campo image: "" para TODOS OS PRODUTOS
  if (fs.existsSync(catalogPath)) {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    let wiped = 0;
    
    for (let item of catalog) {
      if (item.image !== "") {
         item.image = ""; // Limpa injeções erradas do teste passado
         wiped++;
      }
    }
    
    // Sobrescrevendo a base do catalog
    fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
    console.log(` > catalog.json redefinido: ${wiped} imagens corruptas ou de baixa fidelidade foram removidas.`);
  }

  console.log('--- [HARD RESET CONCLUÍDO] Lousa em branco perfeitamente restaurada! ---\n');
}

async function main() {
  const rootDir = path.join(__dirname, '..');
  const catalogPath = path.join(rootDir, 'catalog.json');
  const csvPath = path.join(rootDir, 'novas_fotos.csv');

  if (!fs.existsSync(catalogPath)) {
    console.error(`ERRO: O arquivo catalog.json não foi encontrado em: ${catalogPath}`);
    process.exit(1);
  }

  // Habilitando Hard Reset via linha de comando para não atrapalhar o resume futuro
  if (process.argv.includes('--hard-reset')) {
    hardReset(catalogPath, csvPath);
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

  // 4. MANTENHA A ARQUITETURA [LÓGICA DE ARQUIVO E MEMÓRIA DE ESTADO - Resume]
  const processedIds = new Set();
  
  if (fs.existsSync(csvPath)) {
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n');
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const firstQuoteIdx = line.indexOf('"');
      const secondQuoteIdx = line.indexOf('"', firstQuoteIdx + 1);
      
      if (firstQuoteIdx !== -1 && secondQuoteIdx !== -1) {
         let idString = line.substring(firstQuoteIdx + 1, secondQuoteIdx);
         idString = idString.replace(/""/g, '"');
         processedIds.add(String(idString));
      }
    }
    
    if (processedIds.size > 0) {
        console.log(`[Resume] CSV detectado com ${processedIds.size} itens já buscados (será usado Pulo Inteligente).\n`);
    } else {
        console.log(`[Start] CSV zerado detectado ou recém-purgado...\n`);
    }
  } else {
    console.log(`[Start] Não foi detectado CSV anterior. Iniciando nova busca estrutural...\n`);
    fs.writeFileSync(csvPath, '\uFEFF"Código Produto","URL Foto Encontrada"\n', 'utf8');
  }

  // Filtrando todos que não tem imagem no JSON novo lido logo após a purga
  const itemsWithoutImage = catalog.filter(item => {
    return !item.image || item.image.trim() === '';
  });

  console.log('=============================================');
  console.log(`Total de produtos no catálogo: ${catalog.length}`);
  console.log(`Produtos na fila do filtro sem imagem: ${itemsWithoutImage.length}`);
  console.log('=============================================\n');

  if (itemsWithoutImage.length === 0) {
    console.log('Tudo limpo! Não há itens sem imagens processados.');
    return;
  }

  for (let i = 0; i < itemsWithoutImage.length; i++) {
    const item = itemsWithoutImage[i];

    // Pulo inteligente (Skip Resume)
    if (processedIds.has(String(item.id))) {
      console.log(`[${i + 1}/${itemsWithoutImage.length}] Código: ${item.id} -> Já retido no CSV anterior. Pulando...`);
      continue;
    }
    
    // RESTAURAÇÃO DA BLINDAGEM - Limpeza do Nome
    const cleanedName = cleanSearchTerm(item.name);
    const categoria = item.category || '';
    
    // 3. RESTAURAÇÃO DA QUERY DE LUXO ENRIQUECIDA EM INGLÊS (Hard Requirement)
    const searchTerm = `${cleanedName} ${categoria} professional isolated studio product photography white background`.trim();

    console.log(`[${i + 1}/${itemsWithoutImage.length}] Código: ${item.id} | Buscando: "${searchTerm}"`);

    try {
      const images = await google.image(searchTerm, { safe: false });
      
      let finalUrl = null;

      if (images && images.length > 0) {
        // Arquitetura Preservada: Validação Estrita & Filter Lixo
        const strictRegex = /\.(jpg|jpeg|png|webp)(\?.*)?$/i;
        const trashRegex = /(icon|thumbnail|avatar|logo|base64)/i;

        const validImage = images.find(img => {
           const url = img.url;
           return strictRegex.test(url) && !trashRegex.test(url);
        });

        if (validImage) {
            finalUrl = validImage.url;
        }
      }

      if (finalUrl) {
        console.log(`   -> OK [Alta Fidelidade]: ${finalUrl}`);
        
        // MANTENHA A ARQUITETURA [INJEÇÃO DIRETA NO JSON CATALOG]
        item.image = finalUrl; 
        fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');

        // Registro de Append e Backup do Sucesso no CSV
        const cleanId = item.id ? String(item.id).replace(/"/g, '""') : '';
        const cleanUrl = finalUrl.replace(/"/g, '""');
        
        fs.appendFileSync(csvPath, `"${cleanId}","${cleanUrl}"\n`, 'utf8');
      } else {
        console.log(`   -> AVISO: A imagem foi barrada pelo bloqueio estrito. URL Ignorada.`);
      }

    } catch (error) {
      console.error(`   -> ERRO de Requisição HTTP:`, error.message);
    }

    // Arquitetura Preservada: Rate Limiting
    const waitTime = Math.floor(Math.random() * 2000) + 3000; 
    console.log(`   ⏳ Aguardando limitador (${waitTime}ms)...\n`);
    await delay(waitTime);
  }

  console.log(`\n=============================================`);
  console.log(`Final de fila finalizado. Arquitetura salva.`);
  console.log(`=============================================`);
}

main();
