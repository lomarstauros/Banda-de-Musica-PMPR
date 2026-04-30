// jsPDF v4 — named export + autoTable plugin
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { PMPR_LOGO, BANDA_LOGO } from './pdf-logos';
import { normalizeSpaces } from './utils';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** CPF: 000.XXX.XXX-00 */
const maskCPF = (cpf: string): string => {
  if (!cpf) return '---.---.---/--';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return cpf || '---.---.---/--';
  return `${clean.substring(0, 3)}.XXX.XXX-${clean.substring(9, 11)}`;
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

/** YYYY-MM-DD → "Curitiba, 07 de abril de 2026." */
const formatSignatureDate = (dateStr: string): string => {
  try {
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return '';
    const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    return `Curitiba, ${String(d.getDate()).padStart(2, '0')} de ${months[d.getMonth()]} de ${d.getFullYear()}.`;
  } catch { return ''; }
};

/**
 * Recebe um nome completo (UPPERCASE) e um nome de guerra (UPPERCASE).
 * Retorna partes: [antes, nomeGuerra, depois] para renderização com bold parcial.
 */
const splitByWarName = (fullNameRaw: string, warNameRaw: string) => {
  const fullName = normalizeSpaces(fullNameRaw);
  const warName = normalizeSpaces(warNameRaw);

  if (!warName || !fullName.includes(warName)) return null;
  const idx = fullName.indexOf(warName);
  return {
    before: fullName.substring(0, idx),
    bold: warName,
    after: fullName.substring(idx + warName.length),
  };
};

// ─── Main ────────────────────────────────────────────────────────────────────


/**
 * Desenha uma página ou bloco de escala no documento jsPDF fornecido.
 * @returns O Y final após o desenho.
 */
const drawScalePage = (doc: jsPDF, scale: any, profilesMap: Record<string, any>, options: { showHeader?: boolean; showSignatures?: boolean; startY?: number } = {}) => {
  const { showHeader = true, showSignatures = true, startY } = options;
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

    const parts = splitByWarName(raw.content, raw.warName);
    if (!parts) return;

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
    const getRobustWidth = (txt: string) => {
      if (!txt) return 0;
      doc.setFont('helvetica', 'normal');
      const w = doc.getTextWidth(txt + 'A');
      const a = doc.getTextWidth('A');
      return w - a;
    };

    if (parts.before) {
      doc.setFont('helvetica', 'normal');
      doc.text(parts.before, cx, textY);
      cx += getRobustWidth(parts.before);
    }
    doc.setFont('helvetica', 'bold');
    doc.text(parts.bold, cx, textY);
    
    // Para a parte 'after', precisamos medir a largura do bold
    const getBoldWidth = (txt: string) => {
      doc.setFont('helvetica', 'bold');
      const w = doc.getTextWidth(txt + 'A');
      const a = doc.getTextWidth('A');
      return w - a;
    };
    
    cx += getBoldWidth(parts.bold);
    
    if (parts.after) {
      doc.setFont('helvetica', 'normal');
      doc.text(parts.after, cx, textY);
    }
    doc.setFont('helvetica', 'normal');
  };

  // ── LOGOS & CABEÇALHO (Somente se solicitado) ----------------------------
  if (showHeader) {
    try {
      if (PMPR_LOGO) doc.addImage(PMPR_LOGO, 'PNG', margin, curY - 5, 20, 20);
      if (BANDA_LOGO) doc.addImage(BANDA_LOGO, 'PNG', pageWidth - margin - 20, curY - 5, 20, 20);
    } catch (e) { console.warn('Logo error:', e); }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('ESTADO DO PARANÁ', pageWidth / 2, curY, { align: 'center' });
    doc.text('POLÍCIA MILITAR', pageWidth / 2, curY + 5, { align: 'center' });
    doc.text('CENTRO DE COMUNICAÇÃO SOCIAL', pageWidth / 2, curY + 10, { align: 'center' });
    doc.text('BANDA DE MÚSICA', pageWidth / 2, curY + 15, { align: 'center' });
    curY += 25;

    // ── TÍTULO DA DATA -------------------------------------------------------
    const dateLabel = scale.date ? formatScaleDate(scale.date) : 'DATA NÃO INFORMADA';
    doc.setFontSize(10);
    doc.text(`ESCALA PARA O DIA ${dateLabel}`, pageWidth / 2, curY, { align: 'center' });
    curY += 10;
  } else {
    // ── BARRA SEPARADORA PARA NOVOS SERVIÇOS --------------------------------
    doc.setFillColor(19, 91, 236); // Cor Primária #135bec
    doc.rect(margin, curY - 10, pageWidth - 2 * margin, 8, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const serviceTitle = (scale.title || 'SERVIÇO').toUpperCase();
    const serviceTime = scale.startTime ? ` às ${scale.startTime}` : '';
    doc.text(`PRÓXIMO SERVIÇO: ${serviceTitle}${serviceTime}`, pageWidth / 2, curY - 4.5, { align: 'center' });
    
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(0);
    curY += 2; // Pequeno ajuste de respiro após a barra
  }

  // ── REFERÊNCIA -----------------------------------------------------------
  const referencia = exp.referencia || 'Determinação do Sr. Maestro Chefe da Banda de Música.';

  // ── DADOS DETALHES ------------------------------------------------------
  const rMaestroChefe = getPersonData(maestroChefePerson, exp.regenteMaestro || '');
  const rRegente = getPersonData(regentePerson, exp.regente || '');
  const rChief = getPersonData(chiefPerson, '');
  const rArquivo = getPersonData(arquivoPerson, exp.arquivo || '');

  autoTable(doc, {
    startY: curY,
    body: [
      scale.departureTime ? ['SAÍDA', { content: scale.departureTime, colSpan: 2 }] : null,
      scale.startTime ? ['INÍCIO', { content: scale.startTime, colSpan: 2 }] : null,
      scale.endTime ? ['TÉRMINO', { content: scale.endTime, colSpan: 2 }] : null,
      scale.returnTime ? ['RETORNO', { content: scale.returnTime, colSpan: 2 }] : null,
      scale.format ? ['FORMATO', { content: (scale.format || '').toUpperCase(), colSpan: 2 }] : null,
      scale.title ? ['SERVIÇO', { content: (scale.title || '').toUpperCase(), colSpan: 2 }] : null,
      referencia ? ['REFERÊNCIA', { content: referencia, colSpan: 2 }] : null,
      scale.location ? ['LOCAL', { content: (scale.location || '').toUpperCase(), colSpan: 2 }] : null,
      scale.uniform ? ['UNIFORME', { content: (scale.uniform || '').toUpperCase(), colSpan: 2 }] : null,
      rMaestroChefe ? ['MAESTRO CHEFE', rMaestroChefe, rMaestroChefe.cpf] : null,
      rRegente ? ['REGENTE', rRegente, rRegente.cpf] : null,
      rChief ? ['CHEFE DO SERVIÇO', rChief, rChief.cpf] : null,
      rArquivo ? ['ARQUIVO', rArquivo, rArquivo.cpf] : null,
    ].filter(Boolean) as any[],
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
      0: { fontStyle: 'bold', cellWidth: 35 },
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

  const expBody = [
    rSarg ? ['SARGENTEAÇÃO', rSarg, rSarg.cpf] : null,
    ...adminRows,
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
        0: { fontStyle: 'bold', cellWidth: 35 },
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

  autoTable(doc, {
    startY: curY + 5,
    head: [['Nº', 'GRADUAÇÃO – NOMES', 'CPF']],
    body: musiciansRows.map((r: any) => [r.num, r.nameObj, r.cpf]),
    theme: 'plain',
    headStyles: {
      fontStyle: 'bold', halign: 'center',
      fillColor: [255, 255, 255] as any, textColor: [0, 0, 0] as any,
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

  // ── ASSINATURAS (Somente se solicitado) -----------------------------------
  if (showSignatures) {
    let footerY = curY + 15;
    if (footerY > 255) { doc.addPage(); footerY = 30; }

    const rightX = pageWidth - margin;
    const signDate = formatSignatureDate(scale.date || '');
    if (signDate) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(signDate, rightX, footerY, { align: 'right' });
      footerY += 12;
    }

    const drawSignRight = (y: number, fullName: string, funcao: string) => {
      doc.setFontSize(8);
      const centerX = rightX - 40;
      doc.setFont('helvetica', 'bolditalic');
      doc.setTextColor(160, 70, 0);
      doc.text('(Assinado eletronicamente)', centerX, y, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      const nameY = y + 5;
      doc.setFont('helvetica', 'bold');
      doc.text(fullName, centerX, nameY, { align: 'center' });
      doc.text(funcao, centerX, nameY + 5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
    };

    if (maestroChefePerson) {
      const fname = normalizeSpaces(`${(maestroChefePerson.rank || '').toUpperCase()} ${(maestroChefePerson.name || '').toUpperCase()}`);
      drawSignRight(footerY, fname, 'Maestro Chefe da Banda de Música.');
      footerY += 20;
    } else if (exp.regenteMaestro) {
      drawSignRight(footerY, normalizeSpaces(exp.regenteMaestro.toUpperCase()), 'Maestro Chefe da Banda de Música.');
      footerY += 20;
    }

    if (sargPerson) {
      const fname = normalizeSpaces(`${(sargPerson.rank || '').toUpperCase()} ${(sargPerson.name || '').toUpperCase()}`);
      drawSignRight(footerY, fname, 'Sargenteante da Banda de Música');
    } else if (exp.sargenteacao) {
      drawSignRight(footerY, normalizeSpaces(exp.sargenteacao.toUpperCase()), 'Sargenteante da Banda de Música');
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

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    
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

export const generateDailyScalesPDF = async (scales: any[], allProfiles: any[] = []) => {
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

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    
    const profilesMap: Record<string, any> = {};
    profiles.forEach((p: any) => { profilesMap[p.id] = p; });

    let currentY = 15;
    scales.forEach((scale, index) => {
      // Se não for a primeira escala, adicionar um espaçamento maior para o divisor
      if (index > 0) {
        currentY += 25; // Espaço para a barra azul e respiro
        // Check if there's enough space for at least the details table
        if (currentY > 230) {
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
        showSignatures: index === scales.length - 1,
        startY: currentY
      });
    });

    const dateStr = scales[0].date || 'sem_data';
    const filename = `Escalas_${dateStr}.pdf`;
    downloadPDF(doc, filename);

  } catch (err) {
    console.error('ERRO PDF DIÁRIO:', err);
    alert('Erro ao gerar o PDF das escalas. Verifique o console para detalhes.');
  }
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
