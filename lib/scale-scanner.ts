import pako from 'pako';

export interface ScannedScaleMetadata {
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  departureTime: string;
  location: string;
  uniform: string;
}

export interface MatchedMusician {
  id: string;
  name: string;
  war_name: string;
  rank: string;
  instrument: string;
  photo_url?: string;
  roleInScale: string; // Função / Posto designado
  matchedLine: string; // Linha do documento onde foi encontrado
  selected: boolean;
}

/**
 * Normaliza e limpa string para busca semântica insensível a acentos, pontuações e caixa.
 */
export function cleanStr(s?: string): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ºª°]/g, '')
    .replace(/[.,\-_/\\()]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Decodifica strings hexadecimais em formato PDF (<00480065...> ou <4865...>).
 */
function decodeHexPdfString(hex: string): string {
  const cleanHex = hex.replace(/[\s\r\n]/g, '');
  if (cleanHex.length === 0) return '';
  const paddedHex = cleanHex.length % 2 !== 0 ? cleanHex + '0' : cleanHex;

  // Verifica se é UTF-16BE (inicia com FEFF ou padrão de pares com 00)
  if (paddedHex.length >= 4 && paddedHex.length % 4 === 0) {
    if (paddedHex.toLowerCase().startsWith('feff')) {
      let str = '';
      for (let i = 4; i < paddedHex.length; i += 4) {
        str += String.fromCharCode(parseInt(paddedHex.slice(i, i + 4), 16));
      }
      return str;
    }
  }

  // Decodifica padrão Latin1 / ASCII
  let str = '';
  for (let i = 0; i < paddedHex.length; i += 2) {
    const code = parseInt(paddedHex.slice(i, i + 2), 16);
    // Ignora caracteres de controle nulos se for UTF-16 disfarçado
    if (code !== 0) {
      str += String.fromCharCode(code);
    }
  }
  return str;
}

/**
 * Trata caracteres escapados comuns em PDF (\(, \), \\, \r, \n, \t, octais).
 */
function unescapePdfString(str: string): string {
  return str
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\r/g, ' ')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\b/g, '')
    .replace(/\\f/g, '')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

/**
 * Extrai texto legível de um fluxo (content stream) do PDF parseando os operadores BT ... ET.
 */
function parsePdfContentStream(contentStr: string): string {
  const pieces: string[] = [];
  const btRegex = /BT[\s\S]*?ET/g;
  let btMatch: RegExpExecArray | null;

  while ((btMatch = btRegex.exec(contentStr)) !== null) {
    const block = btMatch[0];

    // 1. Tj com parênteses: (Texto) Tj
    const tjRegex = /\((.*?)\)\s*Tj/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      pieces.push(unescapePdfString(tjMatch[1]));
    }

    // 2. Tj com hex: <48656c6c6f> Tj
    const hexTjRegex = /<([0-9a-fA-F\s]+)>\s*Tj/g;
    let hexTjMatch: RegExpExecArray | null;
    while ((hexTjMatch = hexTjRegex.exec(block)) !== null) {
      pieces.push(decodeHexPdfString(hexTjMatch[1]));
    }

    // 3. TJ array: [(Texto) 10 (Mais texto)] TJ ou [<0041> -20 <0042>] TJ
    const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/g;
    let tjArrayMatch: RegExpExecArray | null;
    while ((tjArrayMatch = tjArrayRegex.exec(block)) !== null) {
      const inner = tjArrayMatch[1];
      let linePart = '';
      const tokenRegex = /\((.*?)\)|<([0-9a-fA-F\s]+)>|(-?\d+)/g;
      let tokenMatch: RegExpExecArray | null;
      while ((tokenMatch = tokenRegex.exec(inner)) !== null) {
        if (tokenMatch[1] !== undefined) {
          linePart += unescapePdfString(tokenMatch[1]);
        } else if (tokenMatch[2] !== undefined) {
          linePart += decodeHexPdfString(tokenMatch[2]);
        } else if (tokenMatch[3] !== undefined) {
          const spacing = parseInt(tokenMatch[3], 10);
          if (spacing < -120) {
            linePart += ' ';
          }
        }
      }
      if (linePart) pieces.push(linePart);
    }

    // Quebra de linha indicada por operadores PDF
    if (block.includes('T*') || block.includes('Td') || block.includes('TD') || block.includes('Tm')) {
      pieces.push('\n');
    }
  }

  return pieces
    .join(' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extrator binário puro de alta fidelidade para streams do PDF usando Uint8Array e Pako.
 * Nunca retorna lixo binário.
 */
export function extractTextFromPdfUint8Array(bytes: Uint8Array): string {
  const streamMarker = [115, 116, 114, 101, 97, 109]; // "stream"
  const endstreamMarker = [101, 110, 100, 115, 116, 114, 101, 97, 109]; // "endstream"

  function findSubarray(main: Uint8Array, sub: number[], start = 0): number {
    for (let i = start; i <= main.length - sub.length; i++) {
      let match = true;
      for (let j = 0; j < sub.length; j++) {
        if (main[i + j] !== sub[j]) { match = false; break; }
      }
      if (match) return i;
    }
    return -1;
  }

  const extractedTexts: string[] = [];
  let idx = 0;

  while (true) {
    const sPos = findSubarray(bytes, streamMarker, idx);
    if (sPos === -1) break;

    // Localiza o início dos dados após "stream\r\n" ou "stream\n"
    let dataStart = sPos + streamMarker.length;
    if (bytes[dataStart] === 13 && bytes[dataStart + 1] === 10) {
      dataStart += 2;
    } else if (bytes[dataStart] === 10 || bytes[dataStart] === 13) {
      dataStart += 1;
    }

    // Inspeciona o dicionário anterior ao stream para pegar /Length e /Filter
    const dictStart = Math.max(0, sPos - 350);
    const dictBytes = bytes.subarray(dictStart, sPos);
    let dictStr = '';
    for (let i = 0; i < dictBytes.length; i++) {
      dictStr += String.fromCharCode(dictBytes[i]);
    }

    const isFlate = /\/Filter\s*(\/\w+)*\/FlateDecode/i.test(dictStr);
    const lengthMatch = dictStr.match(/\/Length\s+(\d+)/);

    let dataEnd = -1;
    if (lengthMatch) {
      const len = parseInt(lengthMatch[1], 10);
      dataEnd = dataStart + len;
    } else {
      dataEnd = findSubarray(bytes, endstreamMarker, dataStart);
      if (dataEnd !== -1) {
        if (bytes[dataEnd - 2] === 13 && bytes[dataEnd - 1] === 10) {
          dataEnd -= 2;
        } else if (bytes[dataEnd - 1] === 10 || bytes[dataEnd - 1] === 13) {
          dataEnd -= 1;
        }
      }
    }

    if (dataEnd > dataStart && dataEnd <= bytes.length) {
      const streamData = bytes.subarray(dataStart, dataEnd);
      let contentStr = '';

      if (isFlate) {
        try {
          const inflated = pako.inflate(streamData);
          contentStr = new TextDecoder('latin1').decode(inflated);
        } catch {
          try {
            const raw = pako.inflateRaw(streamData);
            contentStr = new TextDecoder('latin1').decode(raw);
          } catch {}
        }
      } else {
        contentStr = new TextDecoder('latin1').decode(streamData);
      }

      if (contentStr && (contentStr.includes('BT') || contentStr.includes('Tj') || contentStr.includes('TJ'))) {
        const parsed = parsePdfContentStream(contentStr);
        if (parsed && /[a-zA-ZÀ-ÿ]{3,}/.test(parsed)) {
          extractedTexts.push(parsed);
        }
      }
    }

    idx = sPos + streamMarker.length + 1;
  }

  return extractedTexts.join('\n\n').trim();
}

/**
 * Carrega a biblioteca PDF.js dinamicamente no navegador a partir de CDN seguro.
 */
export async function loadPdfJs(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib;

  return new Promise((resolve) => {
    const existing = document.querySelector('script[src*="pdf.min.js"]');
    if (existing) {
      let count = 0;
      const interval = setInterval(() => {
        count++;
        if ((window as any).pdfjsLib || count > 30) {
          clearInterval(interval);
          resolve((window as any).pdfjsLib || null);
        }
      }, 100);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    script.onload = () => {
      const pdfjs = (window as any).pdfjsLib;
      if (pdfjs) {
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(pdfjs);
      } else {
        resolve(null);
      }
    };
    script.onerror = () => {
      // Fallback
      const fallbackScript = document.createElement('script');
      fallbackScript.src = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js';
      fallbackScript.async = true;
      fallbackScript.onload = () => {
        const pdfjs = (window as any).pdfjsLib;
        if (pdfjs) {
          pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
          resolve(pdfjs);
        } else {
          resolve(null);
        }
      };
      fallbackScript.onerror = () => resolve(null);
      document.head.appendChild(fallbackScript);
    };
    document.head.appendChild(script);
  });
}

/**
 * Extrai texto completo de alta fidelidade usando PDF.js com preservação de linhas e colunas.
 */
export async function extractTextWithPdfJs(arrayBuffer: ArrayBuffer, pdfjs: any): Promise<string> {
  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true,
    });
    const pdfDoc = await loadingTask.promise;
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      let lastY: number | null = null;
      let pageText = '';

      for (const item of textContent.items) {
        if ('str' in item) {
          const str = (item as any).str;
          if (!str) continue;
          const currentY = (item as any).transform ? (item as any).transform[5] : null;

          if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 5) {
            pageText += '\n';
          } else if (pageText && !pageText.endsWith('\n') && !pageText.endsWith(' ') && !str.startsWith(' ')) {
            pageText += ' ';
          }

          pageText += str;
          if (currentY !== null) lastY = currentY;
        }
      }

      if (pageText.trim()) {
        pageTexts.push(pageText.trim());
      }
    }

    return pageTexts.join('\n\n').trim();
  } catch (err) {
    console.warn('Falha no PDF.js, utilizando extrator nativo:', err);
    return '';
  }
}

/**
 * Extrai texto legível de um arquivo PDF digital decodificando seus fluxos internos.
 * Tenta PDF.js primeiro (suporte completo a CMap e fontes embutidas) e faz fallback para o extrator Uint8Array.
 * Garante que JAMAIS retornará caracteres binários ilegíveis.
 */
export async function extractTextFromPdfBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  // 1. Tenta carregar e executar via PDF.js no navegador
  if (typeof window !== 'undefined') {
    try {
      const pdfjs = await loadPdfJs();
      if (pdfjs) {
        const text = await extractTextWithPdfJs(arrayBuffer, pdfjs);
        if (text && text.trim().length > 10) {
          return text.trim();
        }
      }
    } catch (e) {
      console.warn('Erro ao extrair via PDF.js:', e);
    }
  }

  // 2. Extrator binário local Uint8Array + Pako
  try {
    const bytes = new Uint8Array(arrayBuffer);
    const nativeText = extractTextFromPdfUint8Array(bytes);
    if (nativeText && nativeText.trim().length > 10) {
      return nativeText.trim();
    }
  } catch (e) {
    console.warn('Erro ao extrair via extrator nativo:', e);
  }

  // 3. Se nenhuma camada de texto for encontrada (PDF escaneado/imagem)
  return '';
}

/**
 * Varre o texto do documento e infere metadados da escala (Data, Horários, Local, Uniforme, Título).
 */
export function scanScaleMetadata(text: string): ScannedScaleMetadata {
  const metadata: ScannedScaleMetadata = {
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    departureTime: '',
    location: '',
    uniform: ''
  };

  if (!text) return metadata;

  // 1. DATA (DD/MM/YYYY ou DD/MM/YY ou DD de Mês de YYYY)
  const dateRegex = /\b(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})\b/;
  const dateMatch = text.match(dateRegex);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const month = dateMatch[2].padStart(2, '0');
    let year = dateMatch[3];
    if (year.length === 2) year = '20' + year;
    metadata.date = `${year}-${month}-${day}`;
  } else {
    // Procura por ex: "03 de novembro de 2026" ou "03 Novembro"
    const writtenDateRegex = /\b(\d{1,2})\s+(?:de\s+)?(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+(?:de\s+)?(\d{4}))?\b/i;
    const writtenMatch = text.match(writtenDateRegex);
    if (writtenMatch) {
      const day = writtenMatch[1].padStart(2, '0');
      const monthMap: Record<string, string> = {
        janeiro: '01', fevereiro: '02', marco: '03', março: '03',
        abril: '04', maio: '05', junho: '06', julho: '07', agosto: '08',
        setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
      };
      const month = monthMap[writtenMatch[2].toLowerCase()] || '01';
      const year = writtenMatch[3] || new Date().getFullYear().toString();
      metadata.date = `${year}-${month}-${day}`;
    }
  }

  // 2. HORÁRIOS (ex: 08:00 às 14:00, 08h00 às 12h00, Início: 08:00)
  const rangeTimeRegex = /\b(\d{1,2}[:h]\d{2})\s*(?:às|as|-|a|até)\s*(\d{1,2}[:h]\d{2})\b/i;
  const rangeMatch = text.match(rangeTimeRegex);
  if (rangeMatch) {
    metadata.startTime = rangeMatch[1].replace('h', ':');
    metadata.endTime = rangeMatch[2].replace('h', ':');
  } else {
    const startTimeRegex = /(?:início|inicio|horário|horario|a partir das|iniciando às)\s*[:]?\s*(\d{1,2}[:h]\d{2})\b/i;
    const startMatch = text.match(startTimeRegex);
    if (startMatch) {
      metadata.startTime = startMatch[1].replace('h', ':');
    }
  }

  // Horário de Saída / Apresentação
  const depTimeRegex = /(?:saída|saida|apresentação|apresentacao|embarque)\s*[:]?\s*(\d{1,2}[:h]\d{2})\b/i;
  const depMatch = text.match(depTimeRegex);
  if (depMatch) {
    metadata.departureTime = depMatch[1].replace('h', ':');
  }

  // 3. UNIFORME
  const uniformRegex = /(?:uniforme|traje|fardamento)\s*[:]?\s*([^\n\r,.;]{3,50})/i;
  const uniformMatch = text.match(uniformRegex);
  if (uniformMatch) {
    metadata.uniform = uniformMatch[1].trim();
  }

  // 4. LOCAL
  const locRegex = /(?:local|localidade|ponto de encontro|endereço|local do evento)\s*[:]?\s*([^\n\r]{4,80})/i;
  const locMatch = text.match(locRegex);
  if (locMatch) {
    metadata.location = locMatch[1].trim();
  }

  // 5. TÍTULO / ASSUNTO DA ESCALA
  const titleRegex = /(?:escala de serviço|ordem de serviço|operação|operacao|evento|solenidade|missão|missao|serviço externo)\s*[:\-]?\s*([^\n\r]{4,90})/i;
  const titleMatch = text.match(titleRegex);
  if (titleMatch) {
    metadata.title = titleMatch[0].trim();
  } else {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    if (lines.length > 0) {
      metadata.title = lines[0].slice(0, 80);
    } else {
      metadata.title = 'Escala de Serviço Externa';
    }
  }

  return metadata;
}

/**
 * Varre o texto do documento e identifica todos os militares da Banda da PMPR cadastrados,
 * extraindo para cada um a função ou posto específico atribuído na escala.
 */
export function scanMusiciansFromText(text: string, registeredMusicians: any[]): MatchedMusician[] {
  if (!text || !registeredMusicians || registeredMusicians.length === 0) return [];

  const matched: MatchedMusician[] = [];
  const matchedIds = new Set<string>();

  // Quebra o texto em linhas para análise contextual
  const rawLines = text.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0);
  const cleanFullDocument = cleanStr(text);

  // Palavras-chave de postos e funções militares comuns em ordens de serviço
  const functionKeywords = [
    'comandante', 'subcomandante', 'chefe', 'oficial de dia', 'adjunto',
    'permanencia', 'permanência', 'sentinela', 'portão', 'portao', 'segurança',
    'seguranca', 'transito', 'trânsito', 'motorista', 'radio', 'rádio', 'operador',
    'guarda', 'patrulha', 'reforço', 'reforco', 'apoio', 'fiscal', 'rpa', 'choque',
    'batedor', 'regente', 'músico', 'musico', 'som', 'p/1', 'p/3', 'p/4', 'p/5',
    'armaria', 'sala de armas', 'reserva de armas', 'posto', 'palco', 'solista',
    'itinerante', 'policiamento', 'fiscalização', 'escala', 'viatura', 'prefixo'
  ];

  for (const musician of registeredMusicians) {
    const warName = (musician.war_name || '').trim();
    const fullName = (musician.name || '').trim();
    const rank = (musician.rank || '').trim();
    const re = (musician.re || '').trim();
    const rg = (musician.rg || '').trim();
    const cpf = (musician.cpf || '').trim();
    const id = musician.id;

    if (!warName && !fullName) continue;

    // Constrói termos de busca com prioridade
    const searchTerms: string[] = [];

    // 1. RE / RG (muito comum em escalas militares PMPR)
    const cleanReDigits = re.replace(/\D/g, '');
    if (cleanReDigits.length >= 5) searchTerms.push(cleanReDigits);

    const cleanRgDigits = rg.replace(/\D/g, '');
    if (cleanRgDigits.length >= 5 && cleanRgDigits !== cleanReDigits) searchTerms.push(cleanRgDigits);

    // 2. CPF (se disponível)
    const cleanCpfDigits = cpf.replace(/\D/g, '');
    if (cleanCpfDigits.length >= 8) searchTerms.push(cleanCpfDigits);

    // 3. Nome de Guerra
    const cleanWar = cleanStr(warName);
    if (cleanWar.length >= 3) {
      searchTerms.push(cleanWar);

      // Combinações comuns: "Sgt Heliomar", "3 Sgt Heliomar", etc.
      if (rank) {
        const cleanRank = cleanStr(rank);
        const rankParts = cleanRank.split(' ');
        if (rankParts[0]) {
          searchTerms.push(`${rankParts[0]} ${cleanWar}`);
        }
      }
    }

    // 4. Nome Completo e fragmentos
    const cleanFull = cleanStr(fullName);
    if (cleanFull.length >= 5) {
      searchTerms.push(cleanFull);

      const parts = cleanFull.split(' ').filter(p => p.length >= 2);
      if (parts.length >= 2) {
        // Primeiro e último sobrenome: "Heliomar Santos"
        searchTerms.push(`${parts[0]} ${parts[parts.length - 1]}`);
        // Primeiro e segundo nome: "Heliomar de Jesus"
        if (parts.length >= 3) {
          searchTerms.push(`${parts[0]} ${parts[1]}`);
        }
      }
    }

    // Busca nas linhas do documento
    let bestMatchedLine = '';
    let found = false;

    for (const rawLine of rawLines) {
      const lineClean = cleanStr(rawLine);
      const lineDigits = rawLine.replace(/\D/g, '');

      for (const term of searchTerms) {
        if (/^\d+$/.test(term)) {
          // Busca numérica exata para RE/RG/CPF
          if (lineDigits.includes(term)) {
            found = true;
            bestMatchedLine = rawLine;
            break;
          }
        } else {
          // Busca de texto com delimitador de palavra
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(^|\\b|[^a-z0-9])${escaped}(\\b|[^a-z0-9]|$)`, 'i');
          if (regex.test(lineClean)) {
            found = true;
            bestMatchedLine = rawLine;
            break;
          }
        }
      }
      if (found) break;
    }

    // Se não encontrou linha a linha (ex: tabela sem quebras ou formato contínuo), busca no texto corrido
    if (!found) {
      for (const term of searchTerms) {
        if (/^\d+$/.test(term)) {
          if (text.replace(/\D/g, '').includes(term)) {
            found = true;
            bestMatchedLine = `Identificado pelo RE/RG ${term}`;
            break;
          }
        } else {
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(^|\\b|[^a-z0-9])${escaped}(\\b|[^a-z0-9]|$)`, 'i');
          const matchIdx = cleanFullDocument.search(regex);
          if (matchIdx !== -1) {
            found = true;
            const startSnippet = Math.max(0, matchIdx - 30);
            const endSnippet = Math.min(text.length, matchIdx + term.length + 50);
            bestMatchedLine = text.slice(startSnippet, endSnippet).replace(/[\r\n]+/g, ' ').trim();
            break;
          }
        }
      }
    }

    if (found && !matchedIds.has(id)) {
      matchedIds.add(id);

      // Extrai função ou posto exercido com base na linha/contexto
      let extractedRole = 'Serviço Externo';

      if (bestMatchedLine) {
        let candidateRole = bestMatchedLine;

        // Se a linha tem divisores claros (ex: "-", ":", "|", "/", "–")
        const parts = bestMatchedLine.split(/[:\-\|–—\/]/).map(p => p.trim());
        let foundRolePart = '';

        for (const p of parts) {
          const pClean = cleanStr(p);
          if (functionKeywords.some(k => pClean.includes(k)) && !pClean.includes(cleanWar)) {
            foundRolePart = p;
            break;
          }
        }

        if (foundRolePart) {
          candidateRole = foundRolePart;
        } else {
          // Remove nomes e patentes da linha para sobrar a função
          if (warName) candidateRole = candidateRole.replace(new RegExp(warName, 'gi'), '');
          if (fullName) candidateRole = candidateRole.replace(new RegExp(fullName, 'gi'), '');
          if (rank) candidateRole = candidateRole.replace(new RegExp(rank, 'gi'), '');
        }

        // Limpeza de pontuação e ruídos residuais
        candidateRole = candidateRole
          .replace(/^[0-9\.\-\:\;\s\|\(\)\/]+/, '')
          .replace(/[0-9\.\-\:\;\s\|\(\)\/]+$/, '')
          .replace(/RG\s*[\d\.\-]+/gi, '')
          .replace(/RE\s*[\d\.\-]+/gi, '')
          .replace(/CPF\s*[\d\.\-]+/gi, '')
          .replace(/PMPR/gi, '')
          .trim();

        if (candidateRole.length >= 3 && candidateRole.length <= 60) {
          extractedRole = candidateRole.charAt(0).toUpperCase() + candidateRole.slice(1);
        }
      }

      matched.push({
        id,
        name: fullName || warName,
        war_name: warName || fullName,
        rank: rank || '',
        instrument: musician.instrument || 'Banda PMPR',
        photo_url: musician.photo_url || '',
        roleInScale: extractedRole,
        matchedLine: bestMatchedLine,
        selected: true
      });
    }
  }

  return matched;
}
