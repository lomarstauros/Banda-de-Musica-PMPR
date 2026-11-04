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
 * Carrega a biblioteca PDF.js via script tag caso não esteja embutida
 */
export async function loadPdfJs(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib;

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
    script.type = 'module';
    script.onload = () => {
      const pdfjs = (window as any).pdfjsLib;
      if (pdfjs) {
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
        resolve(pdfjs);
      } else {
        resolve(null);
      }
    };
    script.onerror = () => {
      // Fallback
      const s2 = document.createElement('script');
      s2.src = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.min.mjs';
      s2.type = 'module';
      s2.onload = () => resolve((window as any).pdfjsLib || null);
      s2.onerror = () => resolve(null);
      document.head.appendChild(s2);
    };
    document.head.appendChild(script);
  });
}

/**
 * Carrega PDF.js de forma resiliente tanto local quanto CDN
 */
async function getPdfJs(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
    return (window as any).pdfjsLib;
  }

  try {
    // Importa o pacote instalado em node_modules
    // @ts-ignore
    const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
    if (pdfjs) {
      if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version || '4.10.38'}/build/pdf.worker.min.mjs`;
      }
      return pdfjs;
    }
  } catch (e) {
    // Se falhar o bundle local, carrega via CDN
    return await loadPdfJs();
  }
  return null;
}

/**
 * Extrai texto completo de alta fidelidade usando PDF.js com preservação de layout e quebras
 */
export async function extractTextWithPdfJs(arrayBuffer: ArrayBuffer, pdfjs: any): Promise<string> {
  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true,
      disableFontFace: true
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
    console.warn('Falha no PDF.js:', err);
    return '';
  }
}

/**
 * Extrator fallback binário para fluxos básicos (Uint8Array + Pako)
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

    let dataStart = sPos + streamMarker.length;
    if (bytes[dataStart] === 13 && bytes[dataStart + 1] === 10) {
      dataStart += 2;
    } else if (bytes[dataStart] === 10 || bytes[dataStart] === 13) {
      dataStart += 1;
    }

    const dictStart = Math.max(0, sPos - 350);
    const dictBytes = bytes.subarray(dictStart, sPos);
    let dictStr = '';
    for (let i = 0; i < dictBytes.length; i++) dictStr += String.fromCharCode(dictBytes[i]);

    const isFlate = /\/Filter\s*(\/\w+)*\/FlateDecode/i.test(dictStr);
    const lengthMatch = dictStr.match(/\/Length\s+(\d+)/);

    let dataEnd = -1;
    if (lengthMatch) {
      dataEnd = dataStart + parseInt(lengthMatch[1], 10);
    } else {
      dataEnd = findSubarray(bytes, endstreamMarker, dataStart);
      if (dataEnd !== -1) {
        if (bytes[dataEnd - 2] === 13 && bytes[dataEnd - 1] === 10) dataEnd -= 2;
        else if (bytes[dataEnd - 1] === 10 || bytes[dataEnd - 1] === 13) dataEnd -= 1;
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
        const matches = contentStr.match(/\((.*?)\)\s*Tj/g);
        if (matches) {
          const words = matches.map(m => m.replace(/\s*Tj$/, '').replace(/^\(/, '').replace(/\)$/, ''));
          const line = words.join(' ').replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ').trim();
          if (line.length > 5) extractedTexts.push(line);
        }
      }
    }

    idx = sPos + streamMarker.length + 1;
  }

  return extractedTexts.join('\n\n').trim();
}

/**
 * Ponto de entrada para extração de texto de PDFs.
 * Garante extração fiel usando PDF.js com fallback binário.
 */
export async function extractTextFromPdfBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  // 1. Tenta carregar PDF.js
  try {
    const pdfjs = await getPdfJs();
    if (pdfjs) {
      const text = await extractTextWithPdfJs(arrayBuffer, pdfjs);
      if (text && text.trim().length > 10) {
        return text.trim();
      }
    }
  } catch (err) {
    console.warn('Erro ao utilizar PDF.js:', err);
  }

  // 2. Fallback binário
  try {
    const text = extractTextFromPdfUint8Array(new Uint8Array(arrayBuffer));
    if (text && text.trim().length > 10) {
      return text.trim();
    }
  } catch (e) {
    console.warn('Erro no fallback binário:', e);
  }

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

  // 1. DATA (DD de Mês de YYYY ou DD/MM/YYYY)
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
  } else {
    const dateRegex = /\b(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})\b/;
    const dateMatch = text.match(dateRegex);
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const month = dateMatch[2].padStart(2, '0');
      let year = dateMatch[3];
      if (year.length === 2) year = '20' + year;
      metadata.date = `${year}-${month}-${day}`;
    }
  }

  // 2. HORÁRIOS (Horário: 06h10min, 16h45min, 08:00 às 18:00)
  const startRegex = /(?:Horário|Horario|Início|Inicio)\s*[:]?\s*(\d{1,2})[h:](\d{2})/i;
  const startMatch = text.match(startRegex);
  if (startMatch) {
    metadata.startTime = `${startMatch[1].padStart(2, '0')}:${startMatch[2]}`;
  } else {
    const rangeTimeRegex = /\b(\d{1,2}[:h]\d{2})\s*(?:às|as|-|a|até)\s*(\d{1,2}[:h]\d{2})\b/i;
    const rangeMatch = text.match(rangeTimeRegex);
    if (rangeMatch) {
      metadata.startTime = rangeMatch[1].replace('h', ':');
      metadata.endTime = rangeMatch[2].replace('h', ':');
    }
  }

  const endRegex = /(?:Término|Termino|às|as)\s*(\d{1,2})[h:](\d{2})/i;
  const endMatch = text.match(endRegex);
  if (endMatch && !metadata.endTime) {
    metadata.endTime = `${endMatch[1].padStart(2, '0')}:${endMatch[2]}`;
  }

  // 3. UNIFORME / EQUIPAMENTO
  const eqRegex = /(?:Equipamento|Uniforme|Traje|Fardamento)\s*[:]?\s*([^\n\r]{4,70})/i;
  const eqMatch = text.match(eqRegex);
  if (eqMatch) {
    metadata.uniform = eqMatch[1].trim();
  }

  // 4. LOCAL
  const locRegex = /(?:Local de Preleção|Local de preleção|Local do evento|Local)\s*[:]?\s*([^\n\r]{4,80})/i;
  const locMatch = text.match(locRegex);
  if (locMatch) {
    // Remove eventual horário inicial ex "06h40 – Praça Da Espanha" -> "Praça Da Espanha"
    const cleanedLoc = locMatch[1].replace(/^\d{1,2}[h:]\d{2}(?:min)?\s*[-–]\s*/i, '').trim();
    metadata.location = cleanedLoc;
  }

  // 5. TÍTULO / ASSUNTO
  const titleRegex = /(?:Operação|Operacao|Escala de Serviço|Ordem de Serviço)\s*([^\n\r]{3,60})/i;
  const titleMatch = text.match(titleRegex);
  if (titleMatch) {
    metadata.title = titleMatch[0].trim();
  } else if (text.includes('IN ITINERE')) {
    metadata.title = 'Operação IN ITINERE';
  } else {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    metadata.title = lines[0]?.slice(0, 70) || 'Escala de Serviço Externa';
  }

  return metadata;
}

/**
 * Varre o texto do documento e identifica todos os militares da Banda da PMPR cadastrados,
 * extraindo para cada um a função ou posto específico atribuído na escala (incluindo Equipe e Viatura).
 */
export function scanMusiciansFromText(text: string, registeredMusicians: any[]): MatchedMusician[] {
  if (!text || !registeredMusicians || registeredMusicians.length === 0) return [];

  const matched: MatchedMusician[] = [];
  const matchedIds = new Set<string>();

  const rawLines = text.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0);
  const cleanFullDocument = cleanStr(text);

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

    const searchTerms: string[] = [];

    // 1. RE / RG numérico
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

      // Ex: "3 Sgt Heliomar", "Sgt Heliomar"
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
        // Primeiro e último nome: "Heliomar Jesus"
        searchTerms.push(`${parts[0]} ${parts[parts.length - 1]}`);
        if (parts.length >= 3) {
          // Primeiro e segundo nome: "Heliomar Freitas"
          searchTerms.push(`${parts[0]} ${parts[1]}`);
        }
      }
    }

    let bestMatchedLine = '';
    let matchedLineIndex = -1;
    let found = false;

    // Busca linha a linha
    for (let i = 0; i < rawLines.length; i++) {
      const rawLine = rawLines[i];
      const lineClean = cleanStr(rawLine);
      const lineDigits = rawLine.replace(/\D/g, '');

      for (const term of searchTerms) {
        if (/^\d+$/.test(term)) {
          if (lineDigits.includes(term)) {
            found = true;
            bestMatchedLine = rawLine;
            matchedLineIndex = i;
            break;
          }
        } else {
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(^|\\b|[^a-z0-9])${escaped}(\\b|[^a-z0-9]|$)`, 'i');
          if (regex.test(lineClean)) {
            found = true;
            bestMatchedLine = rawLine;
            matchedLineIndex = i;
            break;
          }
        }
      }
      if (found) break;
    }

    // Se não encontrou linha a linha, busca no documento corrido
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

      // Extrai função ou posto exercido com base na linha e contexto
      let extractedRole = 'Serviço Operacional Externo';

      // Verifica se linhas anteriores possuem informações de Equipe e Viatura (comum em escalas PMPR)
      if (matchedLineIndex !== -1) {
        for (let k = Math.max(0, matchedLineIndex - 3); k <= matchedLineIndex; k++) {
          const contextLine = rawLines[k];
          // Procura formato "5 18333" (Equipe 5, Viatura 18333)
          const eqMatch = contextLine.match(/^(\d{1,2})\s+(\d{4,5})\b/);
          if (eqMatch) {
            extractedRole = `Equipe ${eqMatch[1]} - Viatura ${eqMatch[2]}`;
            break;
          }
          // Procura menção direta a VTR
          const vtrMatch = contextLine.match(/VTR\s*[:\-]?\s*(\d{4,5})/i);
          if (vtrMatch) {
            extractedRole = `Viatura ${vtrMatch[1]}`;
            break;
          }
        }
      }

      // Se não encontrou Equipe/VTR, tenta extrair a partir de delimitadores ou palavras-chave na linha
      if (extractedRole === 'Serviço Operacional Externo' && bestMatchedLine) {
        let candidateRole = bestMatchedLine;

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
          if (warName) candidateRole = candidateRole.replace(new RegExp(warName, 'gi'), '');
          if (fullName) candidateRole = candidateRole.replace(new RegExp(fullName, 'gi'), '');
          if (rank) candidateRole = candidateRole.replace(new RegExp(rank, 'gi'), '');
        }

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
