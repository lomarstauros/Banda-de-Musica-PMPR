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

  // Se o militar foi explicitamente definido como 'Ativo', ele está Ativo!
  // Afastamentos anteriores do histórico não devem sobrepor a decisão do gestor.
  const mainStatus = (musician.militaryStatus || '').trim();
  if (mainStatus.toLowerCase() === 'ativo') {
    return [];
  }

  const leaves: ActiveLeaveInfo[] = [];

  // 1. Afastamento registrado diretamente nos campos principais do documento
  if (mainStatus) {
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
        // Evita duplicar se já foi adicionado como principal com as mesmas datas
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

  const candidateLeaves = getAllCandidateLeaves(musician);
  if (candidateLeaves.length === 0) return null;

  for (const leave of candidateLeaves) {
    const startYmd = normalizeDateToYMD(leave.startDate);
    const endYmd = normalizeDateToYMD(leave.endDate);
    const isIndef = !!leave.statusIndefinite || (!endYmd && !startYmd);

    // Se não informou data de início, considera já em vigor se a data final for futura ou indefinida
    const hasStarted = !startYmd || targetYmd >= startYmd;
    // Se não for tempo indeterminado e tiver data final, verifica se já passou
    const hasEnded = !isIndef && !!endYmd && targetYmd > endYmd;

    if (hasStarted && !hasEnded) {
      return {
        ...leave,
        statusIndefinite: isIndef,
        isCurrent: true,
        isFuture: false,
        isPast: false,
      };
    }
  }

  return null;
};

/**
 * Retorna um afastamento agendado para o futuro (que inicia após hoje).
 */
export const getUpcomingMilitaryLeave = (musician: MusicianProfile): ActiveLeaveInfo | null => {
  if (!musician) return null;
  const todayYmd = getTodayYMD();

  const candidateLeaves = getAllCandidateLeaves(musician);
  for (const leave of candidateLeaves) {
    const startYmd = normalizeDateToYMD(leave.startDate);
    const endYmd = normalizeDateToYMD(leave.endDate);
    const isIndef = !!leave.statusIndefinite;

    // Inicia no futuro
    if (startYmd && startYmd > todayYmd) {
      if (isIndef || !endYmd || endYmd >= startYmd) {
        return {
          ...leave,
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
 * Usado principalmente na criação de escalas e permutas.
 */
export const isMusicianAvailable = (
  musician: MusicianProfile,
  targetDate: string | Date | null | undefined
): boolean => {
  if (!targetDate) return true;
  const activeLeave = getEffectiveMilitaryLeave(musician, targetDate);
  return activeLeave === null;
};

/**
 * Retorna se o militar está em afastamento HOJE.
 * Retorna o nome da situação formatada (ex: "Férias" ou "Adido (Casa Militar)") ou null se estiver Ativo.
 */
export const getCurrentMilitaryStatus = (musician: MusicianProfile): string | null => {
  const activeLeave = getEffectiveMilitaryLeave(musician);
  if (!activeLeave) return null;

  if (activeLeave.status === 'Adido' && activeLeave.adidoTo) {
    return `Adido (${activeLeave.adidoTo})`;
  }
  return activeLeave.status;
};
