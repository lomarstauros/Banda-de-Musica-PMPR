'use client';

import React from 'react';
import { fmtDate } from '@/lib/format-date';

export type MilitaryStatusType = 'Ativo' | 'Férias' | 'Licença' | 'Atestado' | 'Adido' | 'Outros' | string;

export interface MilitaryStatusStyle {
  label: string;
  badgeCls: string;
  icon: string;
  colorName: string;
}

/**
 * Retorna as configurações visuais padronizadas para cada tipo de situação/afastamento militar.
 */
export function getMilitaryStatusStyle(rawStatus?: string | null): MilitaryStatusStyle {
  const s = (rawStatus || '').trim().toLowerCase();

  if (!s || s === 'ativo') {
    return {
      label: 'ATIVO',
      badgeCls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30',
      icon: 'check_circle',
      colorName: 'emerald',
    };
  }

  if (s.includes('férias') || s.includes('ferias')) {
    return {
      label: 'FÉRIAS',
      badgeCls: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30',
      icon: 'beach_access',
      colorName: 'sky',
    };
  }

  if (s.includes('licença') || s.includes('licenca')) {
    return {
      label: 'LICENÇA',
      badgeCls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30',
      icon: 'event_busy',
      colorName: 'amber',
    };
  }

  if (s.includes('atestado')) {
    return {
      label: 'ATESTADO',
      badgeCls: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30',
      icon: 'medical_services',
      colorName: 'rose',
    };
  }

  if (s.includes('adido')) {
    return {
      label: 'ADIDO',
      badgeCls: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30',
      icon: 'domain',
      colorName: 'purple',
    };
  }

  // Outros / Afastado genérico
  return {
    label: rawStatus ? rawStatus.toUpperCase() : 'OUTROS',
    badgeCls: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30',
    icon: 'info',
    colorName: 'slate',
  };
}

export interface MilitaryStatusBadgeProps {
  status?: string | null;
  upcomingDate?: string;
  adidoTo?: string;
  size?: 'xs' | 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
  onClick?: () => void;
  title?: string;
}

/**
 * Componente padrão de Badge/Pill para Situação Militar e Afastamentos (Ativo, Férias, Licença, etc.)
 */
export function MilitaryStatusBadge({
  status,
  upcomingDate,
  adidoTo,
  size = 'sm',
  showIcon = false,
  className = '',
  onClick,
  title,
}: MilitaryStatusBadgeProps) {
  const style = getMilitaryStatusStyle(status);

  // Tamanhos padronizados
  const sizeCls = {
    xs: 'text-[9px] font-black px-1.5 py-0.5 rounded-full tracking-wider',
    sm: 'text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide',
    md: 'text-xs font-bold px-2.5 py-1 rounded-full tracking-wide',
  }[size];

  const iconSizeCls = {
    xs: 'text-[11px]',
    sm: 'text-[13px]',
    md: 'text-[15px]',
  }[size];

  let displayLabel = style.label;
  if (upcomingDate) {
    const d = fmtDate(upcomingDate).slice(0, 5); // Formato DD/MM
    displayLabel = `${style.label} em ${d}`;
  }

  const Component = onClick ? 'button' : 'span';
  const interactiveCls = onClick
    ? 'cursor-pointer active:scale-95 transition-all hover:brightness-110 shadow-sm'
    : '';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title || (upcomingDate ? `Afastamento agendado a partir de ${fmtDate(upcomingDate)}` : undefined)}
      className={`inline-flex items-center gap-1 font-sans uppercase shrink-0 leading-none ${sizeCls} ${style.badgeCls} ${interactiveCls} ${className}`}
    >
      {showIcon && (
        <span className={`material-symbols-outlined shrink-0 ${iconSizeCls}`}>
          {style.icon}
        </span>
      )}
      <span>{displayLabel}</span>
      {adidoTo && (
        <span className="font-semibold normal-case text-[9px] opacity-80 truncate max-w-[120px]">
          ({adidoTo})
        </span>
      )}
    </Component>
  );
}

export interface MilitaryStatusSelectorProps {
  value: string;
  onChange: (newStatus: string) => void;
  disabled?: boolean;
}

/**
 * Seletor padronizado com botões modernos para escolha de afastamento (Ativo, Férias, Licença, Atestado, Adido, Outros)
 */
export function MilitaryStatusSelector({ value, onChange, disabled }: MilitaryStatusSelectorProps) {
  const options = [
    { id: 'Ativo', label: 'Ativo', icon: 'check_circle' },
    { id: 'Férias', label: 'Férias', icon: 'beach_access' },
    { id: 'Licença', label: 'Licença', icon: 'event_busy' },
    { id: 'Atestado', label: 'Atestado', icon: 'medical_services' },
    { id: 'Adido', label: 'Adido', icon: 'domain' },
    { id: 'Outros', label: 'Outros', icon: 'more_horiz' },
  ];

  const currentVal = value || 'Ativo';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full">
      {options.map((opt) => {
        const isSelected = currentVal.toLowerCase() === opt.id.toLowerCase();
        const style = getMilitaryStatusStyle(opt.id);

        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${
              isSelected
                ? `${style.badgeCls} ring-2 ring-primary/40 shadow-sm scale-[1.02]`
                : 'bg-white dark:bg-gray-800/60 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
            } disabled:opacity-50 cursor-pointer`}
          >
            <span className="material-symbols-outlined text-[16px]">{opt.icon}</span>
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
