'use client';

import Link from 'next/link';
import { motion } from 'motion/react';

export default function WelcomePage() {
  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden justify-between">
      <div className="flex-1 flex flex-col">
        <div className="w-full">
          <div className="flex flex-col">
            <div 
              className="w-full h-[45vh] bg-center bg-no-repeat bg-cover relative"
              style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuCU2sYf5NVyNSBkR_KVpOb4hLCGFnL5nkhvX0WfEKfVmqLtJ-0h97etWUuAXFl904fhGDOUWr7MzZD1-LIaFELhU-LzkRmHYHSWYnB4M67KpCnxD6WxlJjC-SL0R8pUTclIrGMn21OLV_KYyMLe0m8wk01lAXmKUANYPK_o7YMKBF2sIIL8hsDt8vefYYshTk_FuKqFYvd6fscBR5swklObFCk2wdpt3LKBaubrlPQEBHiPoH8PNkM9EaIOIL6_tCs1cSiwPzATWpmC")' }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background-light/20 to-background-light dark:via-background-dark/20 dark:to-background-dark"></div>
            </div>
          </div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col px-6 -mt-6 relative z-10"
        >
          <div className="self-center mb-6 bg-surface-light dark:bg-surface-dark p-3 rounded-full shadow-lg ring-1 ring-slate-100 dark:ring-slate-800">
            <span className="material-symbols-outlined text-4xl text-primary">music_note</span>
          </div>
          <h1 className="text-slate-900 dark:text-white tracking-tight text-[32px] font-extrabold leading-tight text-center mb-3">
            Banda de Música PMPR
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-base font-normal leading-relaxed text-center max-w-[320px] mx-auto">
            Gerenciamento de escalas de serviço intuitivo e seguro. Sua escala de serviço na palma da mão.
          </p>
        </motion.div>
      </div>

      <div className="w-full pb-8 pt-6 px-6 bg-background-light dark:bg-background-dark">
        <div className="flex flex-col gap-4 max-w-[480px] mx-auto w-full">
          <Link href="/login">
            <button className="group relative flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl h-14 px-5 bg-primary hover:bg-primary-dark transition-colors duration-200 text-white text-base font-bold leading-normal tracking-[0.015em] shadow-lg shadow-primary/20">
              <span className="material-symbols-outlined mr-2 text-[20px]">login</span>
              <span className="truncate">Entrar</span>
            </button>
          </Link>
          <button className="group flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl h-14 px-5 bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors duration-200 text-slate-900 dark:text-white text-base font-bold leading-normal tracking-[0.015em]">
            <span className="truncate">Primeiro Acesso</span>
          </button>
          <div className="mt-4 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
              Polícia Militar do Paraná © 2024
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
