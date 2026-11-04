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
 * Remove acentos e converte para minúsculas para comparação semântica.
 */
function cleanStr(s?: string): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Extrai texto legível de um arquivo PDF digital decodificando seus fluxos (streams) internos.
 */
export async function extractTextFromPdfBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(arrayBuffer);
  let binaryStr = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binaryStr += String.fromCharCode.apply(null, Array.from(chunk));
  }

  const textPieces: string[] = [];
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(binaryStr)) !== null) {
    const rawContent = match[1];
    const streamStart = match.index + match[0].indexOf(rawContent);
    const streamBytes = bytes.subarray(streamStart, streamStart + rawContent.length);

    // Tenta descompactar via FlateDecode (pako)
    let decompressed: string = '';
    try {
      const inflated = pako.inflate(streamBytes);
      decompressed = new TextDecoder('latin1').decode(inflated);
    } catch {
      // Se não estiver comprimido ou falhar, usa o conteúdo cru
      decompressed = rawContent;
    }

    // Procura blocos de texto PDF: BT ... ET
    const btRegex = /BT[\s\S]*?ET/g;
    let btMatch: RegExpExecArray | null;

    while ((btMatch = btRegex.exec(decompressed)) !== null) {
      const block = btMatch[0];

      // Operadores Tj e TJ contêm as strings do texto
      // (Texto simples) Tj
      const tjRegex = /\((.*?)\)\s*Tj/g;
      let tjMatch: RegExpExecArray | null;
      while ((tjMatch = tjRegex.exec(block)) !== null) {
        textPieces.push(unescapePdfString(tjMatch[1]));
      }

      // [(Array)(de)(Strings)] TJ
      const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/g;
      let tjArrayMatch: RegExpExecArray | null;
      while ((tjArrayMatch = tjArrayRegex.exec(block)) !== null) {
        const innerArray = tjArrayMatch[1];
        const strRegex = /\((.*?)\)/g;
        let strMatch: RegExpExecArray | null;
        let linePart = '';
        while ((strMatch = strRegex.exec(innerArray)) !== null) {
          linePart += unescapePdfString(strMatch[1]);
        }
        if (linePart) {
          textPieces.push(linePart);
        }
      }

      // Operadores de quebra de linha T*, Td
      if (block.includes('T*') || block.includes('Td')) {
        textPieces.push('\n');
      }
    }
  }

  // Se a extração por streams encontrou texto, junta e retorna
  if (textPieces.length > 0) {
    return textPieces
      .join(' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Fallback: busca por strings entre parênteses em todo o binário
  const fallbackRegex = /\(([^()]{3,120})\)/g;
  const fallbackPieces: string[] = [];
  while ((match = fallbackRegex.exec(binaryStr)) !== null) {
    const candidate = unescapePdfString(match[1]);
    if (/[a-zA-ZÀ-ÿ]{3,}/.test(candidate)) {
      fallbackPieces.push(candidate);
    }
  }

  return fallbackPieces.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Trata caracteres escapados comuns em PDF (\(, \), \\, \r, \n, \t).
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
    // Procura por ex: "15 de novembro de 2026"
    const writtenDateRegex = /\b(\d{1,2})\s+de\s+(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})\b/i;
    const writtenMatch = text.match(writtenDateRegex);
    if (writtenMatch) {
      const day = writtenMatch[1].padStart(2, '0');
      const monthMap: Record<string, string> = {
        janeiro: '01', fevereiro: '02', marco: '03', março: '03',
        abril: '04', maio: '05', junho: '06', julho: '07', agosto: '08',
        setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
      };
      const month = monthMap[writtenMatch[2].toLowerCase()] || '01';
      metadata.date = `${writtenMatch[3]}-${month}-${day}`;
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
  const titleRegex = /(?:escala de serviço|ordem de serviço|operação|evento|solenidade|missão|serviço externo)\s*[:\-]?\s*([^\n\r]{4,90})/i;
  const titleMatch = text.match(titleRegex);
  if (titleMatch) {
    metadata.title = titleMatch[0].trim();
  } else {
    // Pega a primeira linha com texto relevante
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

  // Quebra o texto em linhas e blocos para análise contextual
  const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0);

  // Palavras de função militar para extração
  const functionKeywords = [
    'comandante', 'subcomandante', 'chefe', 'oficial de dia', 'adjunto',
    'permanencia', 'permanência', 'sentinela', 'portão', 'portao', 'segurança',
    'seguranca', 'transito', 'trânsito', 'motorista', 'radio', 'rádio', 'operador',
    'guarda', 'patrulha', 'reforço', 'reforco', 'apoio', 'fiscal', 'rpa', 'choque',
    'batedor', 'regente', 'músico', 'musico', 'som', 'p/1', 'p/3', 'p/4', 'p/5',
    'armaria', 'sala de armas', 'reserva de armas', 'posto'
  ];

  for (const musician of registeredMusicians) {
    const warName = (musician.war_name || '').trim();
    const fullName = (musician.name || '').trim();
    const rank = (musician.rank || '').trim();
    const id = musician.id;

    if (!warName && !fullName) continue;

    // Criamos termos de busca específicos
    const searchTerms: string[] = [];

    // Nome de guerra (mínimo 3 caracteres para evitar falsos positivos)
    if (warName.length >= 3) {
      searchTerms.push(cleanStr(warName));
    }

    // Nome completo
    if (fullName.length >= 5) {
      searchTerms.push(cleanStr(fullName));
      // Primeiro + último nome se for longo
      const parts = fullName.split(' ').filter((p: string) => p.length >= 2);
      if (parts.length >= 2) {
        searchTerms.push(cleanStr(`${parts[0]} ${parts[parts.length - 1]}`));
      }
    }

    // CPF / RG se houver
    if (musician.cpf) {
      const cleanCpf = musician.cpf.replace(/\D/g, '');
      if (cleanCpf.length >= 8) searchTerms.push(cleanCpf);
    }

    if (musician.rg) {
      const cleanRg = musician.rg.replace(/\D/g, '');
      if (cleanRg.length >= 6) searchTerms.push(cleanRg);
    }

    // Procura nas linhas do documento
    let bestMatchedLine = '';
    let found = false;

    for (const rawLine of lines) {
      const lineClean = cleanStr(rawLine);
      const lineDigits = rawLine.replace(/\D/g, '');

      for (const term of searchTerms) {
        // Testa se é número (CPF/RG)
        if (/^\d+$/.test(term)) {
          if (lineDigits.includes(term)) {
            found = true;
            bestMatchedLine = rawLine;
            break;
          }
        } else {
          // Busca com limite de palavra
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(^|\\b|[^a-zA-Z0-9À-ÿ])${escaped}(\\b|[^a-zA-Z0-9À-ÿ]|$)`, 'i');
          if (regex.test(lineClean)) {
            found = true;
            bestMatchedLine = rawLine;
            break;
          }
        }
      }
      if (found) break;
    }

    if (found && !matchedIds.has(id)) {
      matchedIds.add(id);

      // Extrai a função exercida com base na linha onde o militar foi citado
      let extractedRole = 'Serviço Externo';

      if (bestMatchedLine) {
        // Tenta isolar o que não é o nome do militar na linha
        let candidateRole = bestMatchedLine;

        // Remove o posto, nome de guerra e nome completo da linha
        if (warName) candidateRole = candidateRole.replace(new RegExp(warName, 'gi'), '');
        if (fullName) candidateRole = candidateRole.replace(new RegExp(fullName, 'gi'), '');
        if (rank) {
          const rankShort = rank.split(' ')[0] || '';
          if (rankShort) candidateRole = candidateRole.replace(new RegExp(rankShort, 'gi'), '');
          candidateRole = candidateRole.replace(new RegExp(rank, 'gi'), '');
        }

        // Remove pontuação de separação inicial ou final
        candidateRole = candidateRole
          .replace(/^[0-9\.\-\:\;\s\|\(\)]+/, '')
          .replace(/[0-9\.\-\:\;\s\|\(\)]+$/, '')
          .replace(/RG\s*[\d\.\-]+/gi, '')
          .replace(/CPF\s*[\d\.\-]+/gi, '')
          .replace(/PMPR/gi, '')
          .trim();

        // Se tem separador como ":", "-" ou "|"
        const parts = bestMatchedLine.split(/[:\-\|–—]/).map(p => p.trim());
        for (const p of parts) {
          const pClean = cleanStr(p);
          // Se a parte contém alguma palavra chave de função militar e não é só o nome
          if (functionKeywords.some(k => pClean.includes(k)) && !pClean.includes(cleanStr(warName))) {
            candidateRole = p;
            break;
          }
        }

        if (candidateRole.length >= 3 && candidateRole.length <= 60) {
          // Capitaliza a primeira letra
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

