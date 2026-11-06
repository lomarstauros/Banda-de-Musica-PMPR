/**
 * Utilitário central de formatação de datas — padrão DD/MM/AAAA.
 *
 * Todas as exibições de data no sistema devem usar estas funções
 * para garantir o padrão consistente.
 */

/**
 * Normaliza qualquer formato de data (DD/MM/AAAA, AAAA-MM-DD, Timestamp, Date)
 * para a string padrão ISO 'YYYY-MM-DD'.
 */
export const normalizeDateToYMD = (dateInput: any): string => {
  if (!dateInput) return '';

  if (typeof dateInput === 'object') {
    if (typeof dateInput.toDate === 'function') {
      const d = dateInput.toDate();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
      const y = dateInput.getFullYear();
      const m = String(dateInput.getMonth() + 1).padStart(2, '0');
      const day = String(dateInput.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    if (typeof dateInput.seconds === 'number') {
      const d = new Date(dateInput.seconds * 1000);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }

  const str = String(dateInput).trim();

  // Se estiver em formato DD/MM/AAAA ou DD-MM-AAAA
  const brMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    const year = brMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Se estiver em formato YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss
  const isoMatch = str.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return str;
};

/**
 * Retorna a data atual local (hoje) no formato 'YYYY-MM-DD'.
 * Sem dependência de timezone UTC ou conversões propensas a falha.
 */
export const getTodayYMD = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Formata qualquer formato de data → DD/MM/AAAA
 * Ex.: "2026-04-09" → "09/04/2026"
 */
export const fmtDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  const ymd = normalizeDateToYMD(dateStr);
  if (!ymd) return String(dateStr);
  const parts = ymd.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return String(dateStr);
};

/**
 * Formata um objeto Date ou timestamp → DD/MM/AAAA
 * Ex.: new Date() → "09/04/2026"
 */
export const fmtDateObj = (date: Date | null | undefined): string => {
  if (!date || isNaN(date.getTime())) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

/**
 * Formata YYYY-MM-DD → DD/MM/AAAA com dia da semana abreviado
 * Ex.: "2026-04-09" → "Qui, 09/04/2026"
 */
export const fmtDateWithWeekday = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return dateStr;
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return `${weekdays[d.getDay()]}, ${fmtDate(dateStr)}`;
  } catch {
    return dateStr;
  }
};

/**
 * Formata um Timestamp do Firestore (ou Date) → DD/MM/AAAA HH:MM
 * Ex.: Timestamp → "09/04/2026 14:30"
 */
export const fmtDateTime = (date: Date | null | undefined): string => {
  if (!date || isNaN(date.getTime())) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
};
