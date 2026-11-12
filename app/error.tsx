'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Erro capturado pelo ErrorBoundary:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#0b0e14] text-white flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="bg-[#121620] border border-white/10 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl flex flex-col items-center text-center gap-4">
        <div className="size-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
          <span className="material-symbols-outlined text-[36px]">warning</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl sm:text-2xl font-black text-white">Falha ao carregar a página</h2>
          <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
            Ocorreu uma instabilidade pontual ao processar os dados da aplicação.
          </p>
        </div>

        {error?.message && (
          <div className="w-full bg-black/40 border border-white/5 rounded-xl p-3 text-left">
            <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider block mb-1">
              Registro Técnico
            </span>
            <code className="text-xs text-amber-400 font-mono break-all line-clamp-3 block">
              {error.message}
            </code>
          </div>
        )}

        <div className="flex items-center gap-3 w-full mt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="flex-1 py-3 px-4 rounded-xl bg-primary hover:bg-blue-600 text-white font-bold text-xs sm:text-sm shadow-lg shadow-primary/30 transition-all active:scale-95"
          >
            Tentar Novamente
          </button>
          <Link href="/dashboard" className="flex-1">
            <button
              type="button"
              className="w-full py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white font-semibold text-xs sm:text-sm transition-all"
            >
              Ir para o Início
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
