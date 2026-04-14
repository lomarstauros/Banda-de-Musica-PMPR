/**
 * Utilitários para gestão de situação militar (afastamentos)
 */

export interface MusicianProfile {
  militaryStatus?: string;
  statusStartDate?: string;
  statusEndDate?: string;
  [key: string]: any;
}

/**
 * Verifica se um militar está disponível em uma data específica.
 * Usado principalmente na criação de escalas.
 */
export const isMusicianAvailable = (musician: MusicianProfile, targetDate: string | Date | null | undefined): boolean => {
  if (!musician.militaryStatus || musician.militaryStatus === 'Ativo') return true;
  if (!musician.statusStartDate || !musician.statusEndDate || !targetDate) return true;

  const start = new Date(musician.statusStartDate + 'T00:00:00');
  const end = new Date(musician.statusEndDate + 'T23:59:59');
  
  let scaleDate: Date;
  if (typeof targetDate === 'string') {
    scaleDate = new Date(targetDate + 'T12:00:00');
  } else {
    scaleDate = new Date(targetDate);
  }

  // Verifica se a data da escala cai dentro do intervalo de afastamento
  const isBlocked = scaleDate >= start && scaleDate <= end;
  return !isBlocked;
};

/**
 * Retorna se o militar está em afastamento HOJE.
 * Retorna o nome da situação (ex: "Férias") ou null se estiver Ativo.
 */
export const getCurrentMilitaryStatus = (musician: MusicianProfile): string | null => {
  if (!musician.militaryStatus || musician.militaryStatus === 'Ativo') return null;
  
  // Se não houver datas, assume que o status é permanente/indefinido
  if (!musician.statusStartDate || !musician.statusEndDate) return musician.militaryStatus;

  const today = new Date();
  const start = new Date(musician.statusStartDate + 'T00:00:00');
  const end = new Date(musician.statusEndDate + 'T23:59:59');

  if (today >= start && today <= end) {
    return musician.militaryStatus;
  }

  return null;
};
