'use client';

import { useMemo, useState } from 'react';

/**
 * Quadro de Escalação: mostra todos os disponíveis para a data e permite
 * escalar com um clique. Quem já está escalado em um horário que se sobrepõe
 * não aparece na lista daquele serviço (evita o mesmo nome duas vezes no mesmo horário).
 */

export type Occupation = {
  key: string;            // identificador único do destino/função
  label: string;          // nome exibido (ex: "Administrativo", "Concerto de Natal")
  start: number | null;   // minutos desde 00:00 (null = horário não informado)
  end: number | null;
  ids: string[];          // músicos ocupando esse destino
  assignable: boolean;    // se aparece como aba no quadro
};

const toMin = (t?: string): number | null => {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const buildRange = (start?: string, end?: string) => {
  const s = toMin(start);
  let e = toMin(end);
  if (s !== null && e !== null && e <= s) e += 24 * 60; // atravessa a meia-noite
  return { start: s, end: e };
};

/** Sem horário definido, assume-se que pode conflitar (regra conservadora). */
const overlaps = (a: Occupation, b: Occupation) => {
  if (a.start === null || b.start === null) return true;
  const aEnd = a.end ?? a.start + 1;
  const bEnd = b.end ?? b.start + 1;
  return a.start < bEnd && b.start < aEnd;
};

/** Retorna o destino conflitante (se houver) para escalar `musicianId` em `targetKey`. */
export const findConflict = (occupations: Occupation[], targetKey: string, musicianId: string): Occupation | null => {
  const target = occupations.find(o => o.key === targetKey);
  if (!target) return null;
  return occupations.find(o => o.key !== targetKey && o.ids.includes(musicianId) && overlaps(o, target)) || null;
};

type Props = {
  date: string;
  musicians: any[];
  occupations: Occupation[];
  isAvailable: (m: any) => boolean;
  getLabel: (id: string) => string;
  onAssign: (targetKey: string, musicianId: string) => void;
  onUnassign: (targetKey: string, musicianId: string) => void;
};

const fmt = (min: number | null) =>
  min === null ? '--:--' : `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export default function AvailabilityBoard({ date, musicians, occupations, isAvailable, getLabel, onAssign, onUnassign }: Props) {
  const tabs = occupations.filter(o => o.assignable);
  const [activeKey, setActiveKey] = useState<string>('');
  const [search, setSearch] = useState('');
  const active = tabs.find(t => t.key === activeKey) || tabs[0];

  const { available, blocked } = useMemo(() => {
    const available: any[] = [];
    const blocked: { m: any; reason: string }[] = [];
    if (!active) return { available, blocked };
    const q = search.trim().toLowerCase();
    musicians.forEach(m => {
      if (active.ids.includes(m.id)) return;
      if (q && !getLabel(m.id).toLowerCase().includes(q) && !(m.instrument || '').toLowerCase().includes(q)) return;
      if (!isAvailable(m)) { blocked.push({ m, reason: 'Afastado / indisponível na data' }); return; }
      const c = findConflict(occupations, active.key, m.id);
      if (c) { blocked.push({ m, reason: `Já escalado em: ${c.label}` }); return; }
      available.push(m);
    });
    return { available, blocked };
  }, [active, musicians, occupations, isAvailable, getLabel, search]);

  if (!date) {
    return (
      <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-100 dark:border-gray-800 text-center text-sm text-gray-500">
        Selecione a <b>Data Geral</b> para ver os disponíveis.
      </div>
    );
  }

  if (!active) {
    return (
      <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-100 dark:border-gray-800 text-center text-sm text-gray-500">
        Ative o Expediente Administrativo ou acrescente um Serviço Extra na aba <b>Formulário</b> para começar a escalar.
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col overflow-hidden">
      {/* Abas de destino */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar p-2 border-b border-gray-100 dark:border-gray-800">
        {tabs.map(t => (
          <button
            key={t.key}
            id={`board-tab-${t.key}`}
            type="button"
            onClick={() => setActiveKey(t.key)}
            className={`flex-none px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ${t.key === active.key ? 'bg-primary text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
          >
            {t.label} <span className="opacity-70">({t.ids.length})</span>
          </button>
        ))}
      </div>

      <div className="px-4 pt-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
        <span className="material-symbols-outlined text-[14px]">schedule</span>
        {fmt(active.start)} – {fmt(active.end)}
        {active.start === null && <span className="normal-case font-semibold text-amber-500 ml-1">(sem horário: conflita com qualquer serviço)</span>}
      </div>

      {/* Escalados */}
      <div className="px-4 py-3 flex flex-col gap-2">
        <span className="text-xs font-bold text-primary uppercase">Escalados ({active.ids.length})</span>
        <div className="flex flex-wrap gap-1.5 min-h-[28px]">
          {active.ids.length === 0 && <span className="text-xs text-gray-400">Ninguém escalado ainda. Toque em um nome abaixo.</span>}
          {active.ids.map(id => (
            <button
              key={id}
              type="button"
              onClick={() => onUnassign(active.key, id)}
              title="Remover"
              className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary rounded-full pl-2.5 pr-1.5 py-1 font-bold hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              {getLabel(id)}
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          ))}
        </div>
      </div>

      {/* Disponíveis */}
      <div className="px-4 pb-4 flex flex-col gap-2 border-t border-gray-100 dark:border-gray-800 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-emerald-600 uppercase">Disponíveis ({available.length})</span>
        </div>
        <input
          id="board-search"
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar nome ou instrumento..."
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm outline-none"
        />
        <div className="grid grid-cols-2 gap-1.5 max-h-[360px] overflow-y-auto no-scrollbar">
          {available.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => onAssign(active.key, m.id)}
              className="text-left px-3 py-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 hover:bg-emerald-100 active:scale-[0.98] transition-all"
            >
              <span className="block text-xs font-bold dark:text-white leading-tight">{getLabel(m.id)}</span>
              <span className="block text-[9px] text-gray-400 uppercase mt-0.5 truncate">{m.instrument}</span>
            </button>
          ))}
          {available.length === 0 && <span className="col-span-2 text-xs text-gray-400 py-2">Nenhum disponível para este horário.</span>}
        </div>

        {blocked.length > 0 && (
          <details className="mt-1">
            <summary className="text-[10px] font-bold text-gray-400 uppercase cursor-pointer">Indisponíveis neste horário ({blocked.length})</summary>
            <div className="flex flex-col mt-1 divide-y divide-gray-100 dark:divide-gray-800">
              {blocked.map(({ m, reason }) => (
                <div key={m.id} className="flex items-center justify-between py-1.5 opacity-60">
                  <span className="text-xs font-semibold dark:text-white">{getLabel(m.id)}</span>
                  <span className="text-[9px] text-gray-500 text-right">{reason}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
