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
