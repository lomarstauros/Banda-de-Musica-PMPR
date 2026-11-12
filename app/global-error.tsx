'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Erro global não tratado:', error);
  }, [error]);

  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen bg-[#0b0e14] text-white flex items-center justify-center p-6 font-sans">
        <div className="bg-[#121620] border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center gap-4">
          <div className="size-16 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center">
            <span style={{ fontSize: '32px' }}>⚠️</span>
          </div>
          <h2 className="text-xl font-bold">Falha no Carregamento</h2>
          <p className="text-xs text-gray-400">
            {error?.message || 'Houve um problema de carregamento no aplicativo da Banda de Música.'}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all"
          >
            Recarregar Aplicativo
          </button>
        </div>
      </body>
    </html>
  );
}

