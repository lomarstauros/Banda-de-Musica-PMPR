import { normalizeDateToYMD, getTodayYMD } from './format-date';

/**
 * Utilitários para gestão de situação militar (afastamentos)
 */

export interface MusicianProfile {
  militaryStatus?: string;
  statusStartDate?: string;
  statusEndDate?: string;
  statusIndefinite?: boolean;
  adidoTo?: string;
  leaveHistory?: any[];
  [key: string]: any;
}

export interface ActiveLeaveInfo {
  status: string;
  startDate?: string;
  endDate?: string;
  statusIndefinite?: boolean;
  adidoTo?: string;
  isCurrent?: boolean;
  isFuture?: boolean;
  isPast?: boolean;
}

/**
 * Normaliza e consolida todos os afastamentos de um militar
 * (campo principal do perfil + histórico de afastamentos).
 */
export const getAllCandidateLeaves = (musician: MusicianProfile): ActiveLeaveInfo[] => {
  if (!musician) return [];

  const leaves: ActiveLeaveInfo[] = [];
  const mainStatus = (musician.militaryStatus || '').trim();

  // 1. Afastamento registrado diretamente nos campos principais do documento (se diferente de Ativo)
  if (mainStatus && mainStatus.toLowerCase() !== 'ativo') {
    leaves.push({
      status: mainStatus,
      startDate: musician.statusStartDate || '',
      endDate: musician.statusEndDate || '',
      statusIndefinite: !!musician.statusIndefinite,
      adidoTo: (musician.adidoTo || '').trim(),
    });
  }

  // 2. Afastamentos cadastrados em leaveHistory
  if (Array.isArray(musician.leaveHistory)) {
    musician.leaveHistory.forEach((item: any) => {
      const s = (item?.status || '').trim();
      if (s && s.toLowerCase() !== 'ativo') {
        const exists = leaves.some(
          l => l.status === s &&
               normalizeDateToYMD(l.startDate) === normalizeDateToYMD(item.startDate) &&
               normalizeDateToYMD(l.endDate) === normalizeDateToYMD(item.endDate)
        );
        if (!exists) {
          leaves.push({
            status: s,
            startDate: item.startDate || '',
            endDate: item.endDate || '',
            statusIndefinite: !!item.statusIndefinite,
            adidoTo: (item.adidoTo || '').trim(),
          });
        }
      }
    });
  }

  return leaves;
};

/**
 * Retorna o afastamento em vigor na data especificada (ou hoje por padrão).
 * Retorna o objeto ActiveLeaveInfo ou null se o militar estiver disponível/ativo.
 */
export const getEffectiveMilitaryLeave = (
  musician: MusicianProfile,
  targetDate?: string | Date | null
): ActiveLeaveInfo | null => {
  if (!musician) return null;
  const targetYmd = targetDate ? normalizeDateToYMD(targetDate) : getTodayYMD();
  if (!targetYmd) return null;

  const mainStatus = (musician.militaryStatus || '').trim();

  // 1. Se o status principal do militar for um afastamento explícito (Licença, Férias, Atestado, Adido, etc.):
  if (mainStatus && mainStatus.toLowerCase() !== 'ativo') {
    const startYmd = normalizeDateToYMD(musician.statusStartDate);
    const endYmd = normalizeDateToYMD(musician.statusEndDate);
    const isIndef = !!musician.statusIndefinite || !endYmd;

    // Se a data de verificação já passou da data de término, o afastamento se encerrou
    const hasEnded = !isIndef && !!endYmd && targetYmd > endYmd;

    if (!hasEnded) {
      return {
        status: mainStatus,
        startDate: musician.statusStartDate || '',
        endDate: musician.statusEndDate || '',
        statusIndefinite: isIndef,
        adidoTo: (musician.adidoTo || '').trim(),
        isCurrent: true,
        isFuture: false,
        isPast: false,
      };
    }
  }

  // 2. Afastamentos cadastrados em leaveHistory
  if (Array.isArray(musician.leaveHistory)) {
    for (const item of musician.leaveHistory) {
      const s = (item?.status || '').trim();
      if (s && s.toLowerCase() !== 'ativo') {
        const startYmd = normalizeDateToYMD(item.startDate);
        const endYmd = normalizeDateToYMD(item.endDate);
        const isIndef = !!item.statusIndefinite || (!endYmd && !startYmd);

        // Se o afastamento foi encerrado antecipadamente
        if (item.earlyReturnDate && targetYmd >= normalizeDateToYMD(item.earlyReturnDate)) {
          continue;
        }

        const hasStarted = !startYmd || targetYmd >= startYmd;
        const hasEnded = !isIndef && !!endYmd && targetYmd > endYmd;

        if (hasStarted && !hasEnded) {
          return {
            status: s,
            startDate: item.startDate || '',
            endDate: item.endDate || '',
            statusIndefinite: isIndef,
            adidoTo: (item.adidoTo || '').trim(),
            isCurrent: true,
            isFuture: false,
            isPast: false,
          };
        }
      }
    }
  }

  return null;
};

/**
 * Retorna um afastamento agendado para o futuro (que inicia após a data de hoje).
 */
export const getUpcomingMilitaryLeave = (musician: MusicianProfile): ActiveLeaveInfo | null => {
  if (!musician) return null;

  // Se o militar já está com afastamento ativo como status principal hoje, NÃO é "upcoming"
  const current = getEffectiveMilitaryLeave(musician);
  if (current) return null;

  const todayYmd = getTodayYMD();
  const allCandidateLeaves = getAllCandidateLeaves(musician);

  for (const leave of allCandidateLeaves) {
    const startYmd = normalizeDateToYMD(leave.startDate);
    const endYmd = normalizeDateToYMD(leave.endDate);
    const isIndef = !!leave.statusIndefinite;

    // Inicia no futuro
    if (startYmd && startYmd > todayYmd) {
      if (isIndef || !endYmd || endYmd >= startYmd) {
        return {
          status: leave.status,
          startDate: leave.startDate || '',
          endDate: leave.endDate || '',
          statusIndefinite: isIndef,
          adidoTo: (leave.adidoTo || '').trim(),
          isCurrent: false,
          isFuture: true,
          isPast: false,
        };
      }
    }
  }

  return null;
};

/**
 * Verifica se um militar está disponível em uma data específica.
 * Retorna FALSE se o militar estiver de licença, férias, atestado ou adido na data.
 * Usado na criação de escalas e permutas para bloquear militares indisponíveis.
 */
export const isMusicianAvailable = (
  musician: MusicianProfile,
  targetDate: string | Date | null | undefined
): boolean => {
  if (!musician) return false;

  // 1. Se o status principal do militar for diretamente um afastamento (Licença, Férias, etc.)
  const mainStatus = (musician.militaryStatus || '').trim();
  if (mainStatus && mainStatus.toLowerCase() !== 'ativo') {
    // Se não há data alvo especificada, o militar com status de afastamento está bloqueado
    if (!targetDate) return false;

    const targetYmd = normalizeDateToYMD(targetDate);
    const endYmd = normalizeDateToYMD(musician.statusEndDate);
    const isIndef = !!musician.statusIndefinite || !endYmd;

    // Se ainda não passou da data de término, está indisponível
    if (isIndef || !endYmd || targetYmd <= endYmd) {
      return false;
    }
  }

  // 2. Se há data alvo informada, verifica afastamentos em vigor (inclusive em leaveHistory)
  if (targetDate) {
    const activeLeave = getEffectiveMilitaryLeave(musician, targetDate);
    return activeLeave === null;
  }

  return true;
};

/**
 * Retorna a situação do militar HOJE.
 * Retorna o nome da situação formatada (ex: "Licença", "Férias" ou "Adido (Casa Militar)") ou null se estiver Ativo.
 */
export const getCurrentMilitaryStatus = (musician: MusicianProfile): string | null => {
  const activeLeave = getEffectiveMilitaryLeave(musician);
  if (activeLeave) {
    if (activeLeave.status === 'Adido' && activeLeave.adidoTo) {
      return `Adido (${activeLeave.adidoTo})`;
    }
    return activeLeave.status;
  }

  const ms = (musician?.militaryStatus || '').trim();
  if (ms && ms.toLowerCase() !== 'ativo') {
    if (ms === 'Adido' && musician.adidoTo) {
      return `Adido (${musician.adidoTo})`;
    }
    return ms;
  }

  return null;
};
