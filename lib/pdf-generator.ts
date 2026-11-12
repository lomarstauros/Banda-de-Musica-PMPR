// jsPDF v4 — named export + autoTable plugin
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { PMPR_LOGO, BANDA_LOGO } from './pdf-logos';
import { normalizeSpaces } from './utils';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** CPF: XXX.123.456-XX */
const maskCPF = (cpf: string): string => {
  if (!cpf) return '---.---.---/--';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return cpf || '---.---.---/--';
  return `XXX.${clean.substring(3, 6)}.${clean.substring(6, 9)}-XX`;
};

/** YYYY-MM-DD → "07 DE ABRIL DE 2026 (TERÇA-FEIRA)" */
const formatScaleDate = (dateStr: string): string => {
  try {
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return dateStr;
    const days = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];
    const months = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    return `${String(d.getDate()).padStart(2, '0')} DE ${months[d.getMonth()]} DE ${d.getFullYear()} (${days[d.getDay()]})`;
  } catch { return dateStr; }
};

/** Gera a data atual da geração do PDF → "Curitiba, 07 de abril de 2026." */
const formatCurrentSignatureDate = (): string => {
  try {
    const d = new Date();
    const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    return `Curitiba, ${String(d.getDate()).padStart(2, '0')} de ${months[d.getMonth()]} de ${d.getFullYear()}.`;
  } catch { return ''; }
};

/**
 * Recebe o conteúdo completo (ex: patente + nome) e o nome de guerra.
 * Retorna uma lista de segmentos permitindo múltiplos termos em negrito,
 * mesmo que não sejam sequenciais (ex: "LUIZ JUNIOR" no meio de "LUIZ GONÇALVES JUNIOR").
 */
const getWarNameSegments = (contentRaw: string, warNameRaw: string) => {
  const content = normalizeSpaces(contentRaw);
  const warName = normalizeSpaces(warNameRaw);

  if (!warName) return [{ text: content, bold: false }];

  const warWords = warName.split(' ');
  const contentWords = content.split(' ');

  const segments: { text: string; bold: boolean }[] = [];

  contentWords.forEach((word, index) => {
    // É bold se a palavra exata existe no nome de guerra.
    const isBold = warWords.includes(word);

    const textToPush = index < contentWords.length - 1 ? word + ' ' : word;
    
    if (segments.length > 0 && segments[segments.length - 1].bold === isBold) {
      segments[segments.length - 1].text += textToPush;
    } else {
      segments.push({ text: textToPush, bold: isBold });
    }
  });

  return segments;
};

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * Formata o título da escala para visualização e PDF, aplicando numeração e formação musical quando apropriado
 */
export const formatScaleSummaryTitle = (scale: any, index?: number): string => {
  const prefix = typeof index === 'number' ? `${index + 1} - ` : '';
  const isAdmin = scale.format === 'Expediente Administrativo' || (scale.title && scale.title.toLowerCase().includes('expediente administrativo'));

  if (isAdmin) {
    return `${prefix}Expediente Administrativo`;
  }

  const rawTitle = (scale.title || scale.format || 'Serviço').trim();
  const rawFormation = (scale.musicalFormation || scale.formation || (scale.format && scale.format !== 'Outros' && scale.format !== rawTitle ? scale.format : '') || '').trim();

  if (rawFormation && !rawTitle.toLowerCase().includes(rawFormation.toLowerCase())) {
    return `${prefix}${rawTitle} - ${rawFormation}`;
  }

  return `${prefix}${rawTitle}`;
};

/**
 * Desenha uma página ou bloco de escala no documento jsPDF fornecido.
 * @returns O Y final após o desenho.
 */
const drawScalePage = (
  doc: jsPDF,
  scale: any,
  profilesMap: Record<string, any>,
  options: {
    showHeader?: boolean;
    showSignatures?: boolean;
    startY?: number;
    signatureExpediente?: any;
    signatureSigner?: any;
    scaleIndex?: number;
    totalScales?: number;
    allDailyScales?: any[];
  } = {}
) => {
  const { showHeader = true, showSignatures = true, startY, signatureExpediente, signatureSigner } = options;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let curY = startY || 15;

  const findProfile = (id: string | null | undefined): any =>
    id ? (profilesMap[id] || null) : null;

  const exp = scale.expediente || {};

  const getPersonData = (p: any | null, fallback = '') => {
    if (!p) return fallback ? { content: normalizeSpaces(fallback.toUpperCase()), warName: '', cpf: '' } : null;
    const rank = normalizeSpaces((p.rank || '').toUpperCase());
    const n = normalizeSpaces((p.name || '').toUpperCase());
    const war = normalizeSpaces((p.war_name || '').toUpperCase());
    const cpf = maskCPF(p.cpf || '');
    return {
      content: `${rank} ${n}`.trim(),
      warName: war,
      cpf: cpf
    };
  };

  const maestroChefePerson = findProfile(exp.regenteMaestroId) || null;
  const regentePerson = findProfile(exp.regenteId) || null;
  const arquivoPerson = findProfile(exp.arquivoId) || null;
  const sargPerson = findProfile(exp.sargenteacaoId) || null;
  const p4Person = findProfile(exp.p4FinancasTransporteId) || null;
  const chiefPerson = scale.serviceChief ? findProfile(scale.serviceChief.id) || scale.serviceChief : null;

  const drawBoldWarNameCell = (data: any) => {
    if (data.section !== 'body') return;
    const raw = data.cell.raw as any;
    if (!raw || !raw.warName || typeof raw.content !== 'string') return;

    const segments = getWarNameSegments(raw.content, raw.warName);
    if (!segments.some(s => s.bold)) return;

    const { x, y, width, height } = data.cell;

    // Preserve zebra striping color
    const fillStr = data.cell.styles.fillColor;
    if (Array.isArray(fillStr) && fillStr.length >= 3) {
      doc.setFillColor(fillStr[0], fillStr[1], fillStr[2]);
    } else if (typeof fillStr === 'number') {
      doc.setFillColor(fillStr, fillStr, fillStr);
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.rect(x + 0.1, y + 0.1, width - 0.2, height - 0.2, 'F');

    doc.setFontSize(8);
    const textY = y + height / 2 + 1.2;
    let cx = x + 1.5;

    // Helper para medir largura incluindo espaços no final (jsPDF às vezes ignora)
    const getRobustWidth = (txt: string, isBold: boolean) => {
      if (!txt) return 0;
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      const w = doc.getTextWidth(txt + 'A');
      const a = doc.getTextWidth('A');
      return w - a;
    };

    segments.forEach(seg => {
      doc.setFont('helvetica', seg.bold ? 'bold' : 'normal');
      doc.text(seg.text, cx, textY);
      cx += getRobustWidth(seg.text, seg.bold);
    });

    doc.setFont('helvetica', 'normal');
  };

  // ── LOGOS & CABEÇALHO (Somente se solicitado) ----------------------------
  if (showHeader) {
    try {
      // Desenha a imagem preservando a proporção original, centralizada numa caixa de 22x22 mm
      const drawLogoFit = (img: string, boxX: number, boxY: number, box: number, alias: string) => {
        const props = doc.getImageProperties(img);
        const ratio = props.width / props.height;
        const w = ratio >= 1 ? box : box * ratio;
        const h = ratio >= 1 ? box / ratio : box;
        doc.addImage(img, 'PNG', boxX + (box - w) / 2, boxY + (box - h) / 2, w, h, alias, 'FAST');
      };
      if (PMPR_LOGO) drawLogoFit(PMPR_LOGO, margin, curY - 3, 22, 'pmpr_logo');
      if (BANDA_LOGO) drawLogoFit(BANDA_LOGO, pageWidth - margin - 22, curY - 3, 22, 'banda_logo');
    } catch (e) { console.warn('Logo error:', e); }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('ESTADO DO PARANÁ', pageWidth / 2, curY, { align: 'center' });
    doc.text('POLÍCIA MILITAR', pageWidth / 2, curY + 5, { align: 'center' });
    doc.text('COMANDO GERAL', pageWidth / 2, curY + 10, { align: 'center' });
    doc.text('CENTRO DE COMUNICAÇÃO SOCIAL', pageWidth / 2, curY + 15, { align: 'center' });
    doc.text('BANDA DE MÚSICA', pageWidth / 2, curY + 20, { align: 'center' });
    curY += 28;

    // ── TÍTULO DA DATA -------------------------------------------------------
    const dateLabel = scale.date ? formatScaleDate(scale.date) : 'DATA NÃO INFORMADA';
    doc.setFontSize(10);
    doc.text(`ESCALA PARA O DIA ${dateLabel}`, pageWidth / 2, curY, { align: 'center' });
    curY += 7;

    // Se houver múltiplas escalas no mesmo dia, exibe a lista quantitativa no cabeçalho
    if (options.allDailyScales && options.allDailyScales.length > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      options.allDailyScales.forEach((s, idx) => {
        const itemTitle = formatScaleSummaryTitle(s, idx);
        const sTime = s.startTime || s.departureTime || s.tripDetails?.departureFromCuritiba;
        const timeLabel = sTime ? ` às ${sTime}` : '';
        doc.text(`${itemTitle}${timeLabel}`, pageWidth / 2, curY, { align: 'center' });
        curY += 4.5;
      });
      doc.setTextColor(0, 0, 0);
      curY += 2;
    }

    if (scale.classification === 'provisoria') {
      doc.setTextColor(220, 38, 38); // Red text
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('*** ESCALA PROVISÓRIA ***', pageWidth / 2, curY, { align: 'center' });
      doc.setTextColor(0, 0, 0); // Reset color
      doc.setFont('helvetica', 'normal');
      curY += 10;
    } else {
      curY += 2;
    }
  } else {
    // ── BARRA SEPARADORA PARA NOVOS SERVIÇOS --------------------------------
    const prefix = scale.classification === 'provisoria' ? '[PROVISÓRIA] ' : '';
    const quantServiceTitle = formatScaleSummaryTitle(scale, options.scaleIndex).toUpperCase();
    const serviceTime = scale.startTime 
      ? ` às ${scale.startTime}` 
      : (scale.tripDetails?.departureFromCuritiba ? ` (Saída: ${scale.tripDetails.departureFromCuritiba})` : '');
    const bannerText = `${prefix}${quantServiceTitle}${serviceTime}`;

    const maxTextWidth = (pageWidth - 2 * margin) - 8; // 4mm de respiro lateral
    doc.setFont('helvetica', 'bold');
    
    // Auto-ajuste de tamanho de fonte para caber perfeitamente na caixa
    let fontSize = 9.5;
    doc.setFontSize(fontSize);
    let lines = doc.splitTextToSize(bannerText, maxTextWidth);

    if (lines.length > 1) {
      doc.setFontSize(8.5);
      const testLines = doc.splitTextToSize(bannerText, maxTextWidth);
      if (testLines.length <= 2) {
        fontSize = 8.5;
        lines = testLines;
      } else {
        fontSize = 7.5;
        doc.setFontSize(fontSize);
        lines = doc.splitTextToSize(bannerText, maxTextWidth);
      }
    }

    const lineHeight = fontSize * 0.42; // Altura aproximada da linha em mm
    const paddingY = 2.5; // Respiro vertical interno
    const boxHeight = Math.max(8, (lines.length * lineHeight) + (paddingY * 2));
    const boxY = curY - 9;

    if (scale.classification === 'provisoria') {
      doc.setFillColor(220, 38, 38); // Fundo vermelho para escala provisória
    } else {
      doc.setFillColor(19, 91, 236); // Cor Primária #135bec
    }
    doc.rect(margin, boxY, pageWidth - 2 * margin, boxHeight, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);

    // Centraliza o bloco de texto vertical e horizontalmente dentro da caixa
    const totalTextHeight = lines.length * lineHeight;
    const firstLineY = boxY + ((boxHeight - totalTextHeight) / 2) + (lineHeight * 0.78);
    lines.forEach((lineText: string, idx: number) => {
      doc.text(lineText, pageWidth / 2, firstLineY + (idx * lineHeight), { align: 'center' });
    });
    
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(0);
    curY = boxY + boxHeight + 4; // Garante que a tabela comece perfeitamente abaixo da faixa
  }

  // ── REFERÊNCIA -----------------------------------------------------------
  const referencia = exp.referencia || 'Determinação do Sr. Maestro Chefe da Banda de Música.';

  // ── DADOS DETALHES ------------------------------------------------------
  const rMaestroChefe = getPersonData(maestroChefePerson, exp.regenteMaestro || '');
  const rRegente = getPersonData(regentePerson, exp.regente || '');
  const rChief = getPersonData(chiefPerson, '');
  const rArquivo = getPersonData(arquivoPerson, exp.arquivo || '');

  const isViagem = scale.format === 'Viagem' || !!scale.tripDetails;
  const trip = scale.tripDetails;
  const serviceDisplayName = formatScaleSummaryTitle(scale, options.scaleIndex).toUpperCase();

  const detailsRows: any[] = [];

  if (isViagem && trip) {
    if (trip.departureFromCuritiba || scale.departureTime) {
      detailsRows.push(['SAÍDA DE CURITIBA', { content: trip.departureFromCuritiba || scale.departureTime, colSpan: 2 }]);
    }
    if (trip.arrivalAtDestination) {
      detailsRows.push(['CHEGADA AO DESTINO', { content: trip.arrivalAtDestination, colSpan: 2 }]);
    }
    if (trip.destinations && trip.destinations.length > 0) {
      trip.destinations.forEach((d: any, dIdx: number) => {
        const destLabel = trip.destinations.length > 1 ? `DESTINO ${dIdx + 1}` : 'DESTINO / CIDADE';
        const parts: string[] = [];
        if (d.city) parts.push(`CIDADE: ${d.city.toUpperCase()}`);
        if (d.location) parts.push(`LOCAL: ${d.location.toUpperCase()}`);
        if (d.serviceTitle) parts.push(`SERVIÇO: ${d.serviceTitle.toUpperCase()}`);
        if (d.startTime || d.endTime) parts.push(`HORÁRIO: ${d.startTime || '--:--'} às ${d.endTime || '--:--'}`);
        detailsRows.push([destLabel, { content: parts.join('   •   '), colSpan: 2 }]);
      });
    }
    if (trip.returnToCuritiba || scale.returnTime) {
      detailsRows.push(['RETORNO A CURITIBA', { content: trip.returnToCuritiba || scale.returnTime, colSpan: 2 }]);
    }
  } else {
    if (scale.departureTime) {
      detailsRows.push(['SAÍDA', { content: scale.departureTime, colSpan: 2 }]);
    }
    if (scale.startTime) {
      detailsRows.push(['INÍCIO', { content: scale.startTime, colSpan: 2 }]);
    }
    if (scale.endTime) {
      detailsRows.push(['TÉRMINO', { content: scale.endTime, colSpan: 2 }]);
    }
    if (scale.returnTime) {
      detailsRows.push(['RETORNO', { content: scale.returnTime, colSpan: 2 }]);
    }
  }

  if (scale.format) {
    detailsRows.push(['FORMATO', { content: (scale.format || '').toUpperCase(), colSpan: 2 }]);
  }

  detailsRows.push(['SERVIÇO', { content: serviceDisplayName, colSpan: 2 }]);

  if (referencia) {
    detailsRows.push(['REFERÊNCIA', { content: referencia, colSpan: 2 }]);
  }

  if (!isViagem && scale.location) {
    detailsRows.push(['LOCAL', { content: (scale.location || '').toUpperCase(), colSpan: 2 }]);
  }

  if (scale.uniform) {
    detailsRows.push(['UNIFORME', { content: (scale.uniform || '').toUpperCase(), colSpan: 2 }]);
  }

  if (rMaestroChefe) detailsRows.push(['MAESTRO CHEFE', rMaestroChefe, rMaestroChefe.cpf]);
  if (rRegente) detailsRows.push(['REGENTE', rRegente, rRegente.cpf]);
  if (rChief) detailsRows.push(['CHEFE DO SERVIÇO', rChief, rChief.cpf]);
  if (rArquivo) detailsRows.push(['ARQUIVO', rArquivo, rArquivo.cpf]);

  autoTable(doc, {
    startY: curY,
    body: detailsRows.filter(Boolean),
    theme: 'plain',
    styles: {
      fontSize: 8, cellPadding: 1.5,
      font: 'helvetica', textColor: [0, 0, 0] as any,
      lineWidth: 0.1, lineColor: [0, 0, 0] as any,
      fillColor: [255, 255, 255] as any,
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245] as any,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 35, fillColor: [230, 230, 230] as any },
      1: { cellWidth: 'auto' },
      2: { halign: 'center', cellWidth: 35 },
    },
    margin: { left: margin, right: margin },
    didDrawCell: drawBoldWarNameCell,
  });

  curY = (doc as any).lastAutoTable?.finalY ?? curY;

  // ── TABELA EXPEDIENTE (Sargenteação / Adm / P4) --------------------------
  const rSarg = getPersonData(sargPerson, exp.sargenteacao || '');
  const rP4 = getPersonData(p4Person, exp.p4FinancasTransporte || '');

  const adminRows: any[] = [];
  (exp.administrativo || []).forEach((item: any, i: number) => {
    const id = typeof item === 'object' ? item.id : item;
    const p = findProfile(id);
    const data = getPersonData(p, typeof item === 'object' ? item.label : item);
    if (data && data.content) {
      adminRows.push([adminRows.length === 0 ? 'ADMINISTRATIVO' : '', data, data.cpf]);
    }
  });

  const obraRows: any[] = [];
  (exp.obra || []).forEach((item: any, i: number) => {
    const id = typeof item === 'object' ? item.id : item;
    const p = findProfile(id);
    const data = getPersonData(p, typeof item === 'object' ? item.label : item);
    if (data && data.content) {
      obraRows.push([obraRows.length === 0 ? 'OBRA' : '', data, data.cpf]);
    }
  });

  const permanenciaRows: any[] = [];
  (exp.permanencia || []).forEach((item: any, i: number) => {
    const id = typeof item === 'object' ? item.id : item;
    const p = findProfile(id);
    const data = getPersonData(p, typeof item === 'object' ? item.label : item);
    if (data && data.content) {
      permanenciaRows.push([permanenciaRows.length === 0 ? 'PERMANÊNCIA' : '', data, data.cpf]);
    }
  });

  const expBody = [
    rSarg ? ['SARGENTEAÇÃO', rSarg, rSarg.cpf] : null,
    ...adminRows,
    ...permanenciaRows,
    ...obraRows,
    rP4 ? ['P4 / FINANÇAS', rP4, rP4.cpf] : null,
  ].filter(Boolean);

  if (expBody.length > 0) {
    autoTable(doc, {
      startY: curY + 2,
      body: expBody,
      theme: 'plain',
      styles: {
        fontSize: 8, cellPadding: 1.5,
        font: 'helvetica', textColor: [0, 0, 0] as any,
        lineWidth: 0.1, lineColor: [0, 0, 0] as any,
        fillColor: [255, 255, 255] as any,
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245] as any,
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 35, fillColor: [230, 230, 230] as any },
        1: { cellWidth: 'auto' },
        2: { halign: 'center', cellWidth: 35 },
      },
      margin: { left: margin, right: margin },
      didDrawCell: drawBoldWarNameCell,
    });
    curY = (doc as any).lastAutoTable?.finalY ?? curY;
  }

  // ── TABELA MÚSICOS --------------------------------------------------------
  const musiciansRows = (scale.musicians || []).map((m: any, i: number) => {
    const profile = findProfile(m.id) || m;
    const rank = normalizeSpaces((profile.rank || m.rank || '').toUpperCase());
    const fullName = normalizeSpaces((profile.name || m.name || '').toUpperCase());
    const warName = normalizeSpaces((profile.war_name || m.war_name || '').toUpperCase());
    const cpf = maskCPF(profile.cpf || m.cpf || '');

    return {
      num: `${i + 1}.`,
      nameObj: { content: `${rank} ${fullName}`, warName: warName },
      cpf: cpf
    };
  });

  if (musiciansRows.length > 0) {
    autoTable(doc, {
      startY: curY + 5,
      head: [['Nº', 'GRADUAÇÃO – NOMES', 'CPF']],
      body: musiciansRows.map((r: any) => [r.num, r.nameObj, r.cpf]),
      theme: 'plain',
      headStyles: {
        fontStyle: 'bold', halign: 'center',
        fillColor: [230, 230, 230] as any, textColor: [0, 0, 0] as any,
        lineWidth: 0.1, lineColor: [0, 0, 0] as any,
      },
      styles: {
        fontSize: 8, cellPadding: 1.5,
        font: 'helvetica', textColor: [0, 0, 0] as any,
        lineWidth: 0.1, lineColor: [0, 0, 0] as any,
        fillColor: [255, 255, 255] as any,
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245] as any,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'left', cellWidth: 'auto' },
        2: { halign: 'center', cellWidth: 35 },
      },
      margin: { left: margin, right: margin },
      didDrawCell: drawBoldWarNameCell,
    });

    curY = (doc as any).lastAutoTable?.finalY ?? curY;
  }

  // ── ASSINATURA DA AUTORIDADE RESPONSÁVEL (Ajustada à direita, totalmente abaixo de tudo) ─
  if (showSignatures) {
    let footerY = curY + 12;
    if (footerY > 255) { doc.addPage(); footerY = 25; }

    const signDate = formatCurrentSignatureDate();
    const dateY = footerY;
    if (signDate) footerY += 8;

    const sigExp = signatureExpediente || exp;
    const signerData = scale.signer || signatureSigner || sigExp.signer || null;

    let signerPerson: any = null;
    let signerTitle = 'Maestro Chefe da Banda de Música da PMPR';

    if (signerData && signerData.id) {
      signerPerson = findProfile(signerData.id) || signerData;
      signerTitle = signerData.title || 'Maestro Chefe da Banda de Música da PMPR';
    } else if (sigExp.regenteMaestroId) {
      signerPerson = findProfile(sigExp.regenteMaestroId);
      signerTitle = 'Maestro Chefe da Banda de Música da PMPR';
    } else if (sigExp.regenteId) {
      signerPerson = findProfile(sigExp.regenteId);
      signerTitle = 'Regente Resp. pelo Cmd da Banda de Música da PMPR';
    } else if (sigExp.regenteMaestro) {
      signerPerson = { name: sigExp.regenteMaestro, war_name: '', rank: '' };
      signerTitle = 'Maestro Chefe da Banda de Música da PMPR';
    }

    if (signerPerson) {
      const rank = normalizeSpaces((signerPerson.rank || '').toUpperCase());
      const rawName = normalizeSpaces((signerPerson.name || '').toUpperCase());
      const warName = normalizeSpaces((signerPerson.war_name || '').toUpperCase());
      const fullNameWithRank = rank ? `${rank} ${rawName}` : rawName;

      // Segmentos com nome de guerra em negrito
      const nameSegments = getWarNameSegments(fullNameWithRank, warName);

      const redHeader = 'Assinado eletronicamente';
      const titleLine = signerTitle;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bolditalic');
      const wRed = doc.getTextWidth(redHeader);

      let wName = 0;
      nameSegments.forEach(seg => {
        doc.setFont('helvetica', seg.bold ? 'bold' : 'normal');
        wName += doc.getTextWidth(seg.text);
      });

      doc.setFont('helvetica', 'normal');
      const wTitle = doc.getTextWidth(titleLine);
      const wDate = signDate ? doc.getTextWidth(signDate) : 0;

      // Bloco alinhado à direita da folha, com os textos centralizados entre si dentro do bloco
      const blockMaxWidth = Math.max(wRed, wName, wTitle, wDate);
      const blockRight = pageWidth - margin;
      const blockLeft = blockRight - blockMaxWidth;
      const blockCenterX = blockRight - (blockMaxWidth / 2);

      // Data centralizada no mesmo eixo de "Assinado eletronicamente"
      if (signDate) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.text(signDate, blockCenterX, dateY, { align: 'center' });
      }

      // Linha 1: "Assinado Eletronicamente" (itálico, em vermelho)
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bolditalic');
      doc.setTextColor(220, 20, 20);
      doc.text(redHeader, blockCenterX, footerY, { align: 'center' });

      // Linha 2: Nome completo com nome de guerra em negrito
      footerY += 4.5;
      let startNameX = blockCenterX - (wName / 2);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8);
      nameSegments.forEach(seg => {
        doc.setFont('helvetica', seg.bold ? 'bold' : 'normal');
        doc.text(seg.text, startNameX, footerY);
        startNameX += doc.getTextWidth(seg.text);
      });

      // Linha 3: Título do cargo
      footerY += 4.5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(titleLine, blockCenterX, footerY, { align: 'center' });

      footerY += 8;
    } else if (signDate) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(signDate, pageWidth - margin, dateY, { align: 'right' });
    }
    curY = footerY;
  }

  return curY;
};

export const generateScalePDF = async (scale: any, allProfiles: any[] = []) => {
  try {
    if (typeof window === 'undefined') return;

    let profiles = [...allProfiles];
    if (profiles.length === 0) {
      try {
        const qSnap = await getDocs(collection(db, 'profiles'));
        profiles = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (err) {
        console.warn('Erro ao buscar perfis para o PDF:', err);
      }
    }

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    
    // Preparar profilesMap
    const profilesMap: Record<string, any> = {};
    profiles.forEach((p: any) => { profilesMap[p.id] = p; });
    (scale.musicians || []).forEach((m: any) => {
      if (m.id && !profilesMap[m.id]) profilesMap[m.id] = m;
    });

    drawScalePage(doc, scale, profilesMap);

    // ── DOWNLOAD ────
    const filename = `Escala_${scale.date || 'sem_data'}_${(scale.title || 'escala').replace(/\s+/g, '_')}.pdf`;
    downloadPDF(doc, filename);

  } catch (err) {
    console.error('ERRO PDF:', err);
    alert('Erro ao gerar o PDF. Verifique o console para detalhes.');
  }
};

export const generateDailyScalesPDF = async (
  scales: any[],
  allProfiles: any[] = [],
  options?: { action?: 'download' | 'view' }
) => {
  try {
    if (typeof window === 'undefined' || !scales.length) return;

    let profiles = [...allProfiles];
    if (profiles.length === 0) {
      try {
        const qSnap = await getDocs(collection(db, 'profiles'));
        profiles = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (err) {
        console.warn('Erro ao buscar perfis para o PDF:', err);
      }
    }

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    
    // Ordenação obrigatória das escalas do dia:
    // 1. Sempre o serviço administrativo (quando houver) é o primeiro a aparecer no PDF.
    // 2. Os demais serviços seguem a ordem cronológica de horário de início respectivo.
    const sortedScales = [...scales].sort((a, b) => {
      const isAdminA = a.format === 'Expediente Administrativo' || (a.title && a.title.toLowerCase().includes('expediente administrativo'));
      const isAdminB = b.format === 'Expediente Administrativo' || (b.title && b.title.toLowerCase().includes('expediente administrativo'));

      if (isAdminA && !isAdminB) return -1;
      if (!isAdminA && isAdminB) return 1;

      const getTime = (s: any) => {
        return s.startTime || s.departureTime || s.tripDetails?.departureFromCuritiba || '00:00';
      };
      return getTime(a).localeCompare(getTime(b));
    });

    const profilesMap: Record<string, any> = {};
    profiles.forEach((p: any) => { profilesMap[p.id] = p; });

    let sigExp = sortedScales[sortedScales.length - 1].expediente || {};
    const adminScale = sortedScales.find(s => s.format === 'Expediente Administrativo' || (s.title && s.title.toLowerCase().includes('expediente administrativo')));
    if (adminScale && adminScale.expediente) {
      sigExp = adminScale.expediente;
    } else {
      const scaleWithSigs = sortedScales.find(s => s.expediente && (s.expediente.regenteMaestro || s.expediente.sargenteacao));
      if (scaleWithSigs) {
        sigExp = scaleWithSigs.expediente;
      }
    }

    const scaleWithSigner = sortedScales.find(s => s.signer && s.signer.id);
    const chosenSigner = scaleWithSigner ? scaleWithSigner.signer : (sortedScales[sortedScales.length - 1].signer || null);

    let currentY = 15;
    sortedScales.forEach((scale, index) => {
      // Se não for a primeira escala, adicionar um espaçamento para o divisor
      if (index > 0) {
        currentY += 15; // Espaço para a barra e respiro
        // Check if there's enough space for at least the details table
        if (currentY > 210) {
          doc.addPage();
          currentY = 15;
        }
      }

      // Enriquecer profilesMap com músicos desta escala específica se não estiverem lá
      (scale.musicians || []).forEach((m: any) => {
        if (m.id && !profilesMap[m.id]) profilesMap[m.id] = m;
      });

      // Se for a primeira escala, desenha o cabeçalho completo
      // Se for a última escala, desenha as assinaturas
      currentY = drawScalePage(doc, scale, profilesMap, {
        showHeader: index === 0,
        showSignatures: index === sortedScales.length - 1,
        startY: currentY,
        signatureExpediente: sigExp,
        signatureSigner: chosenSigner,
        scaleIndex: sortedScales.length > 1 ? index : undefined,
        totalScales: sortedScales.length,
        allDailyScales: sortedScales
      });
    });

    const dateStr = sortedScales[0].date || 'sem_data';
    const filename = `Escalas_${dateStr}.pdf`;
    if (options?.action === 'view') {
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      window.open(url, '_blank');
    } else {
      downloadPDF(doc, filename);
    }

  } catch (err) {
    console.error('ERRO PDF DIÁRIO:', err);
    alert('Erro ao gerar o PDF das escalas. Verifique o console para detalhes.');
  }
};

export const viewDailyScalesPDF = async (scales: any[], allProfiles: any[] = []) => {
  return generateDailyScalesPDF(scales, allProfiles, { action: 'view' });
};

/**
 * Gera PDF do Quadro de Previsões de Serviço em formato de tabela
 */
export const generateForecastsPDF = async (
  forecasts: any[],
  options?: { 
    action?: 'download' | 'view'; 
    signerName?: string; 
    signerRole?: string;
  }
) => {
  try {
    if (!forecasts || forecasts.length === 0) {
      alert('Não há previsões de serviços para gerar o PDF.');
      return;
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let curY = 15;

    // ── LOGOS & CABEÇALHO ----------------------------------------------------
    try {
      const drawLogoFit = (img: string, boxX: number, boxY: number, box: number, alias: string) => {
        const props = doc.getImageProperties(img);
        const ratio = props.width / props.height;
        const w = ratio >= 1 ? box : box * ratio;
        const h = ratio >= 1 ? box / ratio : box;
        doc.addImage(img, 'PNG', boxX + (box - w) / 2, boxY + (box - h) / 2, w, h, alias, 'FAST');
      };
      if (PMPR_LOGO) drawLogoFit(PMPR_LOGO, margin, curY - 3, 22, 'pmpr_logo_forecast');
      if (BANDA_LOGO) drawLogoFit(BANDA_LOGO, pageWidth - margin - 22, curY - 3, 22, 'banda_logo_forecast');
    } catch (e) {
      console.warn('Erro ao carregar logotipos:', e);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text('ESTADO DO PARANÁ', pageWidth / 2, curY, { align: 'center' });
    doc.text('POLÍCIA MILITAR', pageWidth / 2, curY + 4.5, { align: 'center' });
    doc.text('COMANDO GERAL', pageWidth / 2, curY + 9, { align: 'center' });
    doc.text('CENTRO DE COMUNICAÇÃO SOCIAL', pageWidth / 2, curY + 13.5, { align: 'center' });
    doc.text('BANDA DE MÚSICA', pageWidth / 2, curY + 18, { align: 'center' });
    curY += 26;

    // ── TÍTULO DO DOCUMENTO --------------------------------------------------
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('QUADRO DE PREVISÃO DE SERVIÇOS', pageWidth / 2, curY, { align: 'center' });
    curY += 5;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text('Planejamento prévio de serviços, solenidades e apresentações musicais', pageWidth / 2, curY, { align: 'center' });
    curY += 8;

    // Ordenar previsões por data crescente
    const sortedForecasts = [...forecasts].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // Montar linhas da tabela
    const daysWeek = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    const tableData = sortedForecasts.map((f) => {
      // Data
      let dateText = f.date || 'A definir';
      if (f.date && f.date.includes('-')) {
        try {
          const d = new Date(f.date + 'T12:00:00');
          if (!isNaN(d.getTime())) {
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            dateText = `${day}/${month}/${year}\n(${daysWeek[d.getDay()]})`;
          }
        } catch { /* fallback */ }
      }

      // Horário
      let timeText = '';
      if (f.startTime) {
        timeText = `${f.startTime}${f.endTime ? ` às ${f.endTime}` : ''}`;
      } else {
        timeText = '--:--';
      }
      if (f.departureTime) {
        timeText += `\nSaída: ${f.departureTime}`;
      }

      // Evento / Local
      let eventText = (f.title || 'Previsão de Serviço').toUpperCase();
      if (f.location) {
        eventText += `\nLocal: ${f.location}`;
      }
      if (f.uniform) {
        eventText += `\nFardamento: ${f.uniform}`;
      }
      if (f.notes) {
        eventText += `\nObs: ${f.notes}`;
      }

      // Formação Musical
      const formationText = f.musicalFormation || f.formation || 'Banda Completa';

      // Protocolo
      const protocolText = f.protocolNumber != null && String(f.protocolNumber).trim() ? String(f.protocolNumber).trim() : '-';

      return [
        dateText,
        timeText,
        eventText,
        formationText,
        protocolText
      ];
    });

    // ── TABELA DE PREVISÕES -------------------------------------------------
    autoTable(doc, {
      startY: curY,
      head: [['DATA', 'HORÁRIO', 'TÍTULO / EVENTO', 'FORMAÇÃO MUSICAL', 'PROTOCOLO']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [19, 91, 236], // Azul Institucional PMPR
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
        valign: 'middle',
        cellPadding: 2.5,
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [30, 41, 59],
        valign: 'middle',
        cellPadding: 2.5,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 28, halign: 'center' },
        2: { cellWidth: 62, halign: 'left' },
        3: { cellWidth: 36, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
      },
      margin: { left: margin, right: margin, bottom: 25 },
      didDrawPage: () => {
        const pageNum = doc.getNumberOfPages();
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(140, 140, 140);
        doc.text(
          `Página ${pageNum} — Banda de Música da PMPR — Documento emitido em ${new Date().toLocaleDateString('pt-BR')}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: 'center' }
        );
      }
    });

    const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY : curY + 60;
    let sigY = finalY + 12;

    // Quebra de página se não couber o bloco de assinatura
    if (sigY > pageHeight - 40) {
      doc.addPage();
      sigY = 25;
    }

    // ── ASSINATURA / DATA (Alinhado à Direita, textos centralizados entre si) ─
    const signDate = formatCurrentSignatureDate();
    const signerHeader = 'Assinado eletronicamente';
    const signerName = options?.signerName || 'Comando da Banda de Música';
    const signerRole = options?.signerRole || 'Banda de Música da PMPR';

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bolditalic');
    const wRed = doc.getTextWidth(signerHeader);

    doc.setFont('helvetica', 'bold');
    const wName = doc.getTextWidth(signerName);

    doc.setFont('helvetica', 'normal');
    const wTitle = doc.getTextWidth(signerRole);
    const wDate = signDate ? doc.getTextWidth(signDate) : 0;

    const blockMaxWidth = Math.max(wRed, wName, wTitle, wDate, 65);
    const blockRight = pageWidth - margin;
    const blockCenterX = blockRight - (blockMaxWidth / 2);

    if (signDate) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(signDate, blockCenterX, sigY, { align: 'center' });
      sigY += 5;
    }

    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(8);
    doc.setTextColor(220, 38, 38);
    doc.text(signerHeader, blockCenterX, sigY, { align: 'center' });
    sigY += 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(signerName, blockCenterX, sigY, { align: 'center' });
    sigY += 3.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(60, 60, 60);
    doc.text(signerRole, blockCenterX, sigY, { align: 'center' });

    // Output
    const filename = `Previsao_de_Servicos_${new Date().toISOString().split('T')[0]}.pdf`;
    if (options?.action === 'view') {
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      window.open(url, '_blank');
    } else {
      downloadPDF(doc, filename);
    }

  } catch (err) {
    console.error('ERRO AO GERAR PDF DE PREVISÕES:', err);
    alert('Erro ao gerar o PDF do quadro de previsões. Verifique o console para detalhes.');
  }
};

export const viewForecastsPDF = async (
  forecasts: any[],
  options?: { signerName?: string; signerRole?: string }
) => {
  return generateForecastsPDF(forecasts, { ...options, action: 'view' });
};


const downloadPDF = (doc: jsPDF, filename: string) => {
  const pdfBlob = doc.output('blob');
  const url = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 500);
};
