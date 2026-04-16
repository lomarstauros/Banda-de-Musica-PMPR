// jsPDF v4 — named export + autoTable plugin
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { PMPR_LOGO, BANDA_LOGO } from './pdf-logos';

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
const splitByWarName = (fullName: string, warName: string) => {
  if (!warName || !fullName.includes(warName)) return null;
  const idx = fullName.indexOf(warName);
  return {
    before: fullName.substring(0, idx),
    bold: warName,
    after: fullName.substring(idx + warName.length),
  };
};

// ─── Main ────────────────────────────────────────────────────────────────────

export const generateScalePDF = async (scale: any, allProfiles: any[] = []) => {
  try {
    if (typeof window === 'undefined') return;

    // Se alProfiles não foi passado, buscamos em tempo real do banco de dados para
    // garantir que todos os IDs presentes no expediente tenham nome completo e CPF!
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
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;

    // ── Mescla perfis para enriquecer CPF etc. ──
    const profilesMap: Record<string, any> = {};
    profiles.forEach((p: any) => { profilesMap[p.id] = p; });
    (scale.musicians || []).forEach((m: any) => {
      if (m.id && !profilesMap[m.id]) profilesMap[m.id] = m;
    });
    const findProfile = (id: string | null | undefined): any =>
      id ? (profilesMap[id] || null) : null;

    const exp = scale.expediente || {};

    const getPersonData = (p: any | null, fallback = '') => {
      if (!p) return fallback ? { content: fallback.toUpperCase(), warName: '', cpf: '' } : null;
      const rank = (p.rank || '').toUpperCase();
      const n = (p.name || '').toUpperCase();
      const war = (p.war_name || '').toUpperCase();
      const cpf = maskCPF(p.cpf || '');
      return {
        content: `${rank} ${n}`.trim(),
        warName: war,
        cpf: cpf
      };
    };

    const regentePerson = findProfile(exp.regenteMaestroId) || null;
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

      if (parts.before) {
        doc.setFont('helvetica', 'normal');
        doc.text(parts.before, cx, textY);
        cx += doc.getTextWidth(parts.before);
      }
      doc.setFont('helvetica', 'bold');
      doc.text(parts.bold, cx, textY);
      cx += doc.getTextWidth(parts.bold);
      if (parts.after) {
        doc.setFont('helvetica', 'normal');
        doc.text(parts.after, cx, textY);
      }
      doc.setFont('helvetica', 'normal');
    };

    // ── LOGOS ----------------------------------------------------------------
    try {
      if (PMPR_LOGO) doc.addImage(PMPR_LOGO, 'PNG', margin, 10, 20, 20);
      if (BANDA_LOGO) doc.addImage(BANDA_LOGO, 'PNG', pageWidth - margin - 20, 10, 20, 20);
    } catch (e) { console.warn('Logo error:', e); }

    // ── CABEÇALHO ------------------------------------------------------------
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const hY = 15;
    doc.text('ESTADO DO PARANÁ', pageWidth / 2, hY, { align: 'center' });
    doc.text('POLÍCIA MILITAR', pageWidth / 2, hY + 5, { align: 'center' });
    doc.text('CENTRO DE COMUNICAÇÃO SOCIAL', pageWidth / 2, hY + 10, { align: 'center' });
    doc.text('BANDA DE MÚSICA', pageWidth / 2, hY + 15, { align: 'center' });

    // ── TÍTULO ---------------------------------------------------------------
    const dateLabel = scale.date ? formatScaleDate(scale.date) : 'DATA NÃO INFORMADA';
    doc.setFontSize(10);
    doc.text(`ESCALA PARA O DIA ${dateLabel}`, pageWidth / 2, 40, { align: 'center' });

    // ── HORÁRIO label --------------------------------------------------------
    const formatTimeStr = (label: string, time: string | undefined | null) => time ? `${label}: ${time}` : null;
    const timeParts = [
      formatTimeStr('Saída', scale.departureTime),
      formatTimeStr('Início', scale.startTime),
      formatTimeStr('Término', scale.endTime),
      formatTimeStr('Retorno', scale.returnTime),
    ].filter(Boolean);
    const horario = timeParts.join('  |  ') || 'NÃO DEFINIDO';

    // ── REFERÊNCIA -----------------------------------------------------------
    const referencia = exp.referencia || 'Determinação do Sr. Maestro Chefe da Banda de Música.';

    // ── DADOS DETALHES ------------------------------------------------------
    const rRegente = getPersonData(regentePerson, exp.regenteMaestro || '') || { content: '', cpf: '' };
    const rChief = getPersonData(chiefPerson, '') || { content: '', cpf: '' };
    const rArquivo = getPersonData(arquivoPerson, exp.arquivo || '') || { content: '', cpf: '' };

    autoTable(doc, {
      startY: 45,
      body: [
        ['SERVIÇO', { content: (scale.title || '').toUpperCase(), colSpan: 2 }],
        ['REFERÊNCIA', { content: referencia, colSpan: 2 }],
        ['LOCAL', { content: (scale.location || '').toUpperCase(), colSpan: 2 }],
        ['HORÁRIO', { content: horario, colSpan: 2 }],
        ['FARDAMENTO', { content: (scale.uniform || '').toUpperCase(), colSpan: 2 }],
        ['REGENTE', rRegente, rRegente.cpf],
        ['CHEFE', rChief, rChief.cpf],
        ['ARQUIVO', rArquivo, rArquivo.cpf],
      ],
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

    // ── TABELA EXPEDIENTE (Sargenteação / Adm / P4) --------------------------
    let curY: number = (doc as any).lastAutoTable?.finalY ?? 100;

    const rSarg = getPersonData(sargPerson, exp.sargenteacao || '') || { content: '', cpf: '' };
    const rP4 = getPersonData(p4Person, exp.p4FinancasTransporte || '') || { content: '', cpf: '' };

    const adminRows: any[] = [];
    (exp.administrativo || []).forEach((item: any, i: number) => {
      const id = typeof item === 'object' ? item.id : item;
      const p = findProfile(id);
      const data = getPersonData(p, typeof item === 'object' ? item.label : item);
      if (data && data.content) {
        adminRows.push([i === 0 ? 'ADMINISTRATIVO' : '', data, data.cpf]);
      }
    });
    if (adminRows.length === 0) {
      adminRows.push(['ADMINISTRATIVO', '', '']);
    }

    const obraRows: any[] = [];
    (exp.obra || []).forEach((item: any, i: number) => {
      const id = typeof item === 'object' ? item.id : item;
      const p = findProfile(id);
      const data = getPersonData(p, typeof item === 'object' ? item.label : item);
      if (data && data.content) {
        obraRows.push([i === 0 ? 'OBRA' : '', data, data.cpf]);
      }
    });

    const expBody = [
      ['SARGENTEAÇÃO', rSarg, rSarg.cpf],
      ...adminRows,
      ...obraRows,
      [{ content: 'P4/FINANÇAS E TRANSPORTE', styles: { fontSize: 6.5 } }, rP4, rP4.cpf],
    ];

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

    // ── TABELA MÚSICOS --------------------------------------------------------
    const musiciansY: number = ((doc as any).lastAutoTable?.finalY ?? 130) + 5;

    const musiciansRows = (scale.musicians || []).map((m: any, i: number) => {
      const profile = findProfile(m.id) || m;
      const rank = (profile.rank || m.rank || '').toUpperCase();
      const fullName = (profile.name || m.name || '').toUpperCase();
      const warName = (profile.war_name || m.war_name || '').toUpperCase();
      const cpf = maskCPF(profile.cpf || m.cpf || '');

      return {
        num: `${i + 1}.`,
        nameObj: { content: `${rank} ${fullName}`, warName: warName },
        cpf: cpf
      };
    });

    autoTable(doc, {
      startY: musiciansY,
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

    // ── ASSINATURAS ----------------------------------------------------------
    let footerY: number = ((doc as any).lastAutoTable?.finalY ?? 240) + 15;
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

      // Eixo de referência: 40mm para a esquerda a partir da margem direita.
      const centerX = rightX - 40;

      doc.setFont('helvetica', 'bolditalic');
      doc.setTextColor(160, 70, 0);
      doc.text('(Assinado eletronicamente)', centerX, y, { align: 'center' });
      doc.setTextColor(0, 0, 0);

      const nameY = y + 5;
      
      // Nome completo em negrito, resolvendo problemas de cálculo width
      doc.setFont('helvetica', 'bold');
      doc.text(fullName, centerX, nameY, { align: 'center' });

      // Função em fonte normal
      doc.setFont('helvetica', 'bold');
      doc.text(funcao, centerX, nameY + 5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
    };

    if (regentePerson) {
      const fname = `${(regentePerson.rank || '').toUpperCase()} ${(regentePerson.name || '').toUpperCase()}`;
      drawSignRight(footerY, fname, 'Maestro Chefe da Banda de Música.');
      footerY += 20;
    } else if (exp.regenteMaestro) {
      drawSignRight(footerY, exp.regenteMaestro.toUpperCase(), 'Maestro Chefe da Banda de Música.');
      footerY += 20;
    }

    if (sargPerson) {
      const fname = `${(sargPerson.rank || '').toUpperCase()} ${(sargPerson.name || '').toUpperCase()}`;
      drawSignRight(footerY, fname, 'Sargenteante da Banda de Música');
    } else if (exp.sargenteacao) {
      drawSignRight(footerY, exp.sargenteacao.toUpperCase(), 'Sargenteante da Banda de Música');
    }

    // ── DOWNLOAD ────
    const filename = `Escala_${scale.date || 'sem_data'}_${(scale.title || 'escala').replace(/\s+/g, '_')}.pdf`;
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

  } catch (err) {
    console.error('ERRO PDF:', err);
    alert('Erro ao gerar o PDF. Verifique o console para detalhes.');
  }
};
