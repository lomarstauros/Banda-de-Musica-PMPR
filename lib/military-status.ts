import { normalizeDateToYMD } from './format-date';

/**
 * Utilitários para gestão de situação militar (afastamentos)
 */

export interface MusicianProfile {
  militaryStatus?: string;
  statusStartDate?: string;
  statusEndDate?: string;
  statusIndefinite?: boolean;
  adidoTo?: string;
  [key: string]: any;
}

/**
 * Verifica se um militar está disponível em uma data específica.
 * Usado principalmente na criação de escalas.
 */
export const isMusicianAvailable = (musician: MusicianProfile, targetDate: string | Date | null | undefined): boolean => {
  if (!musician.militaryStatus || musician.militaryStatus === 'Ativo') return true;
  if (!targetDate) return true;

  let scaleDate: Date;
  if (typeof targetDate === 'string') {
    scaleDate = new Date(targetDate + 'T12:00:00');
  } else {
    scaleDate = new Date(targetDate);
  }

  // Se o afastamento for por tempo indeterminado ou sem data de término
  if (musician.statusIndefinite || !musician.statusEndDate) {
    if (musician.statusStartDate) {
      const startYmd = normalizeDateToYMD(musician.statusStartDate);
      const start = new Date(startYmd + 'T00:00:00');
      // Antes da data inicial de afastamento ainda está disponível
      return scaleDate < start;
    }
    // Sem data de início ou já iniciada: indisponível por tempo indeterminado
    return false;
  }

  if (!musician.statusStartDate) return false;

  const startYmd = normalizeDateToYMD(musician.statusStartDate);
  const endYmd = normalizeDateToYMD(musician.statusEndDate);
  const start = new Date(startYmd + 'T00:00:00');
  const end = new Date(endYmd + 'T23:59:59');
  
  // Verifica se a data da escala cai dentro do intervalo de afastamento
  const isBlocked = scaleDate >= start && scaleDate <= end;
  return !isBlocked;
};

/**
 * Retorna se o militar está em afastamento HOJE.
 * Retorna o nome da situação (ex: "Férias" ou "Adido (Casa Militar)") ou null se estiver Ativo.
 */
export const getCurrentMilitaryStatus = (musician: MusicianProfile): string | null => {
  if (!musician.militaryStatus || musician.militaryStatus === 'Ativo') return null;
  
  const statusDisplay = musician.militaryStatus === 'Adido' && musician.adidoTo 
    ? `Adido (${musician.adidoTo})` 
    : musician.militaryStatus;

  // Se for por tempo indeterminado ou sem data de término
  if (musician.statusIndefinite || !musician.statusEndDate) {
    if (musician.statusStartDate) {
      const today = new Date();
      const startYmd = normalizeDateToYMD(musician.statusStartDate);
      const start = new Date(startYmd + 'T00:00:00');
      if (today >= start) return statusDisplay;
      return null;
    }
    return statusDisplay;
  }

  if (!musician.statusStartDate) return null;

  const today = new Date();
  const startYmd = normalizeDateToYMD(musician.statusStartDate);
  const endYmd = normalizeDateToYMD(musician.statusEndDate);
  const start = new Date(startYmd + 'T00:00:00');
  const end = new Date(endYmd + 'T23:59:59');

  if (today >= start && today <= end) {
    return statusDisplay;
  }

  return null;
};
