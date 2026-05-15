export const getFormatColors = (format: string | undefined) => {
  switch (format) {
    case 'Formatura Militar':
      return { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-800/50' };
    case 'Ensaio':
      return { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800/50' };
    case 'Expediente Administrativo':
      return { bg: 'bg-slate-100 dark:bg-slate-900/30', text: 'text-slate-700 dark:text-slate-400', border: 'border-slate-200 dark:border-slate-800/50' };
    case 'Apresentação local fechado':
      return { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800/50' };
    case 'Apresentação local aberto':
      return { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800/50' };
    case 'Outros':
    default:
      return { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800/50' };
  }
};
