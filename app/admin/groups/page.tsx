'use client';

import Link from 'next/link';
import { motion } from 'motion/react';

export default function AdminGroupsPage() {
  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center">
      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark flex flex-col h-full min-h-screen shadow-2xl">
        <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <Link href="/admin/swaps">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1 text-center pr-10">Gerenciar Grupos</h1>
        </header>

        <main className="flex-1 p-4 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Grupos de Instrumentos</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Organize os músicos por naipes para facilitar a criação de escalas.</p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {[
              { name: 'Madeiras', count: 12, icon: 'music_note', color: 'bg-green-500' },
              { name: 'Metais', count: 15, icon: 'music_note', color: 'bg-amber-500' },
              { name: 'Percussão', count: 6, icon: 'music_note', color: 'bg-red-500' },
              { name: 'Regência', count: 2, icon: 'person', color: 'bg-blue-500' }
            ].map((group, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                <div className={`size-12 rounded-xl ${group.color} flex items-center justify-center text-white shadow-lg shadow-black/5`}>
                  <span className="material-symbols-outlined">{group.icon}</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">{group.name}</h3>
                  <p className="text-xs text-gray-500 font-medium">{group.count} Músicos cadastrados</p>
                </div>
                <button className="size-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 group-hover:text-primary transition-colors">
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-4">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-1">Ações Rápidas</h3>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/admin/musicians" className="flex flex-col items-center justify-center p-4 rounded-2xl bg-primary/5 border border-primary/10 hover:bg-primary/10 transition-colors gap-2">
                <span className="material-symbols-outlined text-primary text-[28px]">group</span>
                <span className="text-xs font-bold text-primary">Ver Efetivo</span>
              </Link>
              <Link href="/admin/musicians/new" className="flex flex-col items-center justify-center p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:bg-gray-100 transition-colors gap-2">
                <span className="material-symbols-outlined text-gray-500 text-[28px]">person_add</span>
                <span className="text-xs font-bold text-gray-600 dark:text-gray-400">Novo Músico</span>
              </Link>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-1">Músicos Recentes</h3>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              {[
                { name: 'Sd. Rocha', instrument: 'Trombone', group: 'Metais' },
                { name: 'Sd. Lima', instrument: 'Clarineta', group: 'Madeiras' },
                { name: 'Sd. Costa', instrument: 'Trompete', group: 'Metais' }
              ].map((musician, i) => (
                <div key={i} className="p-3 flex items-center gap-3 border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer">
                  <div className="size-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 font-bold text-xs uppercase">
                    {musician.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{musician.name}</p>
                    <p className="text-[10px] text-gray-500 font-medium">{musician.instrument} • {musician.group}</p>
                  </div>
                  <span className="text-[10px] font-bold text-green-500 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">Ativo</span>
                </div>
              ))}
            </div>
          </div>
        </main>

        <div className="h-10"></div>
      </div>
    </div>
  );
}
