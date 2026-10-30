'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renderiza os filhos em uma nova janela do navegador (popup) via React Portal.
 * O estado continua sendo o da janela principal, então tudo o que for feito
 * em uma janela aparece na outra em tempo real.
 */
type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  height?: number;
};

export default function PopoutWindow({ title, onClose, children, width = 760, height = 900 }: Props) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const left = Math.max(0, window.screenX + window.outerWidth);
    const win = window.open('', 'quadro-escalacao', `width=${width},height=${height},left=${left},top=${window.screenY}`);
    if (!win) {
      alert('O navegador bloqueou a nova janela. Permita pop-ups para este site e tente novamente.');
      onClose();
      return;
    }

    win.document.title = title;
    win.document.body.innerHTML = '';
    // Copia estilos (Tailwind, fontes, ícones) e o tema escuro da janela principal
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
      win.document.head.appendChild(node.cloneNode(true));
    });
    win.document.documentElement.className = document.documentElement.className;
    win.document.body.className = 'bg-background-light dark:bg-background-dark font-sans min-h-screen';

    const div = win.document.createElement('div');
    div.className = 'p-4 max-w-3xl mx-auto';
    win.document.body.appendChild(div);
    setContainer(div);

    const handleUnload = () => onClose();
    win.addEventListener('beforeunload', handleUnload);
    const closeChild = () => win.close();
    window.addEventListener('beforeunload', closeChild);

    return () => {
      win.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('beforeunload', closeChild);
      win.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return container ? createPortal(children, container) : null;
}
