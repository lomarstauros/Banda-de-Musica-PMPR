/**
 * Utilitários para deduplicação e gerenciamento inteligente de notificações de escalas.
 * Evita notificações duplicadas para o mesmo usuário em escalas do mesmo horário no mesmo dia
 * (especialmente quando há Expediente Administrativo / Rotina e escalas de eventos no mesmo horário).
 */

export interface ScaleTimeContext {
  date?: string;
  scaleDate?: string;
  startTime?: string;
  endTime?: string;
  departureTime?: string;
  returnTime?: string;
  format?: string;
  title?: string;
  scaleTitle?: string;
  scaleId?: string;
}

/**
 * Converte string de horário "HH:MM" em minutos desde o início do dia.
 */
export function parseTimeToMinutes(t?: string | null): number | null {
  if (!t || typeof t !== 'string') return null;
  const parts = t.trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Identifica se a escala se refere à rotina administrativa / Expediente Administrativo geral.
 */
export function isExpedienteScale(scaleOrTitle?: any): boolean {
  if (!scaleOrTitle) return false;
  if (typeof scaleOrTitle === 'string') {
    const s = scaleOrTitle.toLowerCase();
    return s.includes('expediente') || s.includes('rotina');
  }
  const format = (scaleOrTitle.format || '').toLowerCase();
  const title = (scaleOrTitle.title || scaleOrTitle.scaleTitle || '').toLowerCase();
  return format.includes('expediente') || format.includes('rotina') || title.includes('expediente') || title.includes('rotina');
}

/**
 * Verifica se duas escalas ocorrem na mesma data e no mesmo horário (ou horários sobrepostos).
 */
export function areScalesSameScheduleOrOverlapping(
  sA: ScaleTimeContext,
  sB: ScaleTimeContext
): boolean {
  const dateA = sA.date || sA.scaleDate;
  const dateB = sB.date || sB.scaleDate;

  // Se ambas têm data explícita e as datas são diferentes, não há sobreposição
  if (dateA && dateB && dateA !== dateB) {
    return false;
  }

  const isExpA = isExpedienteScale(sA);
  const isExpB = isExpedienteScale(sB);

  // Se ambas forem expediente no mesmo dia, é o mesmo horário
  if (isExpA && isExpB) return true;

  const startA = parseTimeToMinutes(sA.startTime || sA.departureTime);
  const endA = parseTimeToMinutes(sA.endTime || sA.returnTime) || (startA !== null ? startA + 240 : null);

  const startB = parseTimeToMinutes(sB.startTime || sB.departureTime);
  const endB = parseTimeToMinutes(sB.endTime || sB.returnTime) || (startB !== null ? startB + 240 : null);

  // 1. Mesmo horário de início explícito (ex: 13:00 e 13:00)
  if (sA.startTime && sB.startTime && sA.startTime.trim() === sB.startTime.trim()) {
    return true;
  }

  // 2. Se uma das escalas é Expediente Administrativo (rotina) e a outra é escala do mesmo dia:
  if (isExpA || isExpB) {
    const exp = isExpA ? sA : sB;
    const other = isExpA ? sB : sA;
    const expStart = parseTimeToMinutes(exp.startTime || exp.departureTime) ?? (13 * 60); // 13:00 padrão
    const expEnd = parseTimeToMinutes(exp.endTime || exp.returnTime) ?? (19 * 60);       // 19:00 padrão
    const otherStart = parseTimeToMinutes(other.startTime || other.departureTime);

    if (otherStart !== null) {
      // Se a escala do evento inicia durante o expediente ou na mesma faixa de horário
      if (otherStart >= expStart - 45 && otherStart <= expEnd + 45) {
        return true;
      }
    } else {
      // Sem horário explícito cadastrado, mas mesmo dia: considera mesmo turno do expediente
      return true;
    }
  }

  // 3. Sobreposição padrão de intervalos de horários [start, end]
  if (startA !== null && endA !== null && startB !== null && endB !== null) {
    return Math.max(startA, startB) < Math.min(endA, endB);
  }

  return false;
}

/**
 * Dada uma lista de notificações para um usuário, remove duplicatas do mesmo horário/data,
 * priorizando escalas específicas de eventos sobre o Expediente Administrativo genérico.
 */
export function deduplicateNotificationsList(notifications: any[]): any[] {
  if (!Array.isArray(notifications) || notifications.length <= 1) {
    return notifications || [];
  }

  const result: any[] = [];

  for (const notif of notifications) {
    // Procura se já inserimos uma notificação para o mesmo dia e mesmo horário
    const existingIndex = result.findIndex(existing => 
      areScalesSameScheduleOrOverlapping(
        {
          scaleDate: existing.scaleDate,
          scaleTitle: existing.scaleTitle,
          startTime: existing.scaleStartTime || existing.startTime,
          endTime: existing.scaleEndTime || existing.endTime,
          format: existing.format
        },
        {
          scaleDate: notif.scaleDate,
          scaleTitle: notif.scaleTitle,
          startTime: notif.scaleStartTime || notif.startTime,
          endTime: notif.scaleEndTime || notif.endTime,
          format: notif.format
        }
      )
    );

    if (existingIndex === -1) {
      // Não há colisão no mesmo horário, adiciona
      result.push(notif);
    } else {
      const existing = result[existingIndex];
      const isExistingExp = isExpedienteScale(existing.scaleTitle);
      const isNotifExp = isExpedienteScale(notif.scaleTitle);

      // Se a existente for Expediente e a nova for um evento específico, substitui pela específica
      if (isExistingExp && !isNotifExp) {
        result[existingIndex] = notif;
      }
      // Se a nova for Expediente e a existente for específica, ignora a nova
      else if (!isExistingExp && isNotifExp) {
        // Ignora notif
      }
      // Se ambas forem específicas ou ambas expediente:
      // se uma for não lida e a outra lida, mantém a não lida para o usuário não perder
      else if (existing.read && !notif.read) {
        result[existingIndex] = notif;
      }
    }
  }

  return result;
}
