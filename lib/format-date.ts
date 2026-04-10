/**
 * Utilitário central de formatação de datas — padrão DD/MM/AAAA.
 *
 * Todas as exibições de data no sistema devem usar estas funções
 * para garantir o padrão consistente.
 */

/**
 * Formata YYYY-MM-DD → DD/MM/AAAA
 * Ex.: "2026-04-09" → "09/04/2026"
 */
export const fmtDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return dateStr;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return dateStr;
  }
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
