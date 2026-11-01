/**
 * Utilitários para integração e disparo de mensagens via WhatsApp
 */

export function cleanPhoneNumber(phone: string | undefined | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;

  // Se tem 10 ou 11 dígitos (DDD + número), adiciona DDI 55 (Brasil)
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  // Se já tem DDI 55
  if (digits.length >= 12 && digits.startsWith('55')) {
    return digits;
  }

  return digits;
}

export interface NoticeWhatsAppPayload {
  title: string;
  message: string;
  type?: string;
  file?: {
    url?: string;
    name?: string;
  } | null;
  requireConfirmation?: boolean;
}

export function buildNoticeWhatsAppMessage(notice: NoticeWhatsAppPayload): string {
  const isUrgente = (notice.type || '').toLowerCase() === 'urgente';
  const headerIcon = isUrgente ? '🚨' : '📢';
  const typeLabel = isUrgente ? 'URGENTE' : 'COMUNICADO GERAL';

  let msg = `${headerIcon} *BANDA DE MÚSICA DA PMPR*\n`;
  msg += `*${typeLabel}*\n\n`;
  msg += `*Assunto:* ${notice.title.trim()}\n\n`;
  msg += `${notice.message.trim()}\n`;

  if (notice.file?.url) {
    msg += `\n📎 *Anexo disponível:* ${notice.file.url}\n`;
  }

  if (notice.requireConfirmation) {
    msg += `\n⚠️ *Atenção:* Favor acessar o aplicativo da Banda PMPR e confirmar ciência.\n`;
  }

  return msg;
}

export function getWhatsAppDirectUrl(phone: string | undefined | null, message: string): string | null {
  const clean = cleanPhoneNumber(phone);
  if (!clean) return null;
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

export function getWhatsAppBroadcastUrl(message: string): string {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
}

export function buildScaleWhatsAppMessage(scales: any[], dateStr: string): string {
  let displayDate = dateStr;
  if (dateStr && dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  let msg = `🎵 *BANDA DE MÚSICA DA PMPR*\n`;
  msg += `📋 *ESCALA DE SERVIÇO — ${displayDate}*\n`;
  msg += `─────────────────────────\n\n`;

  if (!scales || scales.length === 0) {
    msg += `Nenhum serviço escalado.\n`;
    return msg;
  }

  scales.forEach((scale, idx) => {
    const isExpediente = scale.format === 'Expediente Administrativo' || (scale.title && scale.title.toLowerCase().includes('expediente administrativo'));
    
    if (isExpediente) {
      msg += `🏛️ *EXPEDIENTE ADMINISTRATIVO*\n`;
      if (scale.startTime && scale.endTime) {
        msg += `⏰ *Horário:* ${scale.startTime} às ${scale.endTime}\n`;
      }
      if (scale.uniform) {
        msg += `👔 *Fardamento:* ${scale.uniform}\n`;
      }
      if (scale.expediente) {
        const e = scale.expediente;
        if (e.regenteMaestro) msg += `🎖️ *Maestro Chefe:* ${e.regenteMaestro}\n`;
        if (e.regente) msg += `🎖️ *Regente:* ${e.regente}\n`;
        if (e.sargenteacao) msg += `🎖️ *Sargenteação:* ${e.sargenteacao}\n`;
      }
    } else {
      const title = scale.title || scale.format || `Serviço ${idx + 1}`;
      msg += `🎺 *${title.toUpperCase()}*\n`;
      if (scale.format && scale.format !== title) {
        msg += `📌 *Formato:* ${scale.format}\n`;
      }
      if (scale.startTime) {
        msg += `⏰ *Início:* ${scale.startTime}${scale.endTime ? ` | *Término:* ${scale.endTime}` : ''}\n`;
      }
      if (scale.departureTime) {
        msg += `🚌 *Saída BM:* ${scale.departureTime}\n`;
      }
      if (scale.location) {
        msg += `📍 *Local:* ${scale.location}\n`;
      }
      if (scale.uniform) {
        msg += `👔 *Fardamento:* ${scale.uniform}\n`;
      }
      if (scale.serviceChief?.name) {
        msg += `⭐ *Chefe de Serviço:* ${scale.serviceChief.name}\n`;
      }
      if (scale.musicians && scale.musicians.length > 0) {
        msg += `👥 *Efetivo Escalado (${scale.musicians.length}):*\n`;
        scale.musicians.forEach((m: any) => {
          const rank = m.rank ? `${m.rank} ` : '';
          const name = m.war_name || m.name || 'Militar';
          const inst = m.instrument ? ` (${m.instrument})` : '';
          msg += `   • ${rank}${name}${inst}\n`;
        });
      }
    }
    msg += `\n`;
  });

  msg += `─────────────────────────\n`;
  msg += `📱 Acesse o aplicativo da Banda PMPR para mais detalhes.\n`;

  return msg.trim();
}
