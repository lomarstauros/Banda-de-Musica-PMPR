'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useParams } from 'next/navigation';

export default function AdminSwapDetailPage() {
  const params = useParams();

  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center">
      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark flex flex-col h-full min-h-screen shadow-2xl">
        <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <Link href="/admin/swaps">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1 text-center pr-10">Analisar Permuta</h1>
        </header>

        <main className="flex-1 p-6 flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Solicitação de Troca</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Revise os detalhes da permuta entre os músicos antes de aprovar ou recusar.</p>
          </div>

          <div className="flex items-center justify-between px-4 py-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>
            <div className="flex flex-col items-center gap-2 flex-1">
              <div className="size-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 font-bold text-lg border-2 border-white dark:border-gray-700 shadow-sm">JS</div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">Sd. João Silva</p>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Solicitante</span>
            </div>
            <div className="flex flex-col items-center justify-center gap-1">
              <span className="material-symbols-outlined text-primary text-[32px] animate-pulse">swap_horiz</span>
              <span className="text-[10px] font-bold text-primary uppercase">Troca</span>
            </div>
            <div className="flex flex-col items-center gap-2 flex-1">
              <div className="size-16 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg border-2 border-white dark:border-gray-700 shadow-sm">RS</div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">Sd. Ricardo Santos</p>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Substituto</span>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-1">Detalhes do Evento</h3>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">event</span>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Evento</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Formatura de Oficiais - 12 Nov</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">schedule</span>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Horário</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">07:30 (Apresentação)</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">info</span>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Motivo Alegado</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Assunto Familiar (Viagem inadiável)</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-1">Status do Processo</h3>
            <div className="flex flex-col gap-4 pl-4 relative">
              <div className="absolute left-6 top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-800"></div>
              
              <div className="flex items-center gap-4 relative z-10">
                <div className="size-4 rounded-full bg-green-500 ring-4 ring-green-500/20"></div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Solicitação Criada</p>
                  <p className="text-xs text-gray-500">Hoje às 08:45</p>
                </div>
              </div>

              <div className="flex items-center gap-4 relative z-10">
                <div className="size-4 rounded-full bg-green-500 ring-4 ring-green-500/20"></div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Aceite do Substituto</p>
                  <p className="text-xs text-gray-500">Hoje às 09:12</p>
                </div>
              </div>

              <div className="flex items-center gap-4 relative z-10">
                <div className="size-4 rounded-full bg-amber-500 ring-4 ring-amber-500/20 animate-pulse"></div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Aguardando Comando</p>
                  <p className="text-xs text-gray-500">Pendente de sua análise</p>
                </div>
              </div>
            </div>
          </div>
        </main>

        <footer className="p-6 bg-white dark:bg-background-dark border-t border-gray-100 dark:border-gray-800 flex gap-3">
          <button className="flex-1 h-12 rounded-xl border border-red-200 text-red-600 font-bold hover:bg-red-50 transition-colors">
            Recusar
          </button>
          <button className="flex-[2] h-12 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
            Aprovar Permuta
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
