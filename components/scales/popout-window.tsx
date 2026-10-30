'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renderiza os filhos dentro de uma janela já aberta (window.open) via React Portal.
 * O estado continua sendo o da janela principal, então tudo o que for feito
 * em uma janela aparece na outra em tempo real.
 *
 * A janela é aberta no clique (fora deste componente) para não ser bloqueada
 * pelo navegador e para não ser fechada pelo duplo efeito do React StrictMode.
 */
type Props = {
  win: Window;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export const openPopoutWindow = (width = 760, height = 900): Window | null => {
  const left = Math.max(0, window.screenX + window.outerWidth);
  return window.open('', 'quadro-escalacao', `width=${width},height=${height},left=${left},top=${window.screenY}`);
};

export default function PopoutWindow({ win, title, onClose, children }: Props) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Prepara o documento só uma vez (idempotente)
    let div = win.document.getElementById('popout-root');
    if (!div) {
      win.document.title = title;
      win.document.head.innerHTML = '';
      win.document.body.innerHTML = '';
      document.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
        win.document.head.appendChild(node.cloneNode(true));
      });
      win.document.documentElement.className = document.documentElement.className;
      win.document.body.className = 'bg-background-light dark:bg-background-dark font-sans min-h-screen';
      div = win.document.createElement('div');
      div.id = 'popout-root';
      div.className = 'p-4 max-w-3xl mx-auto';
      win.document.body.appendChild(div);
    }
    setContainer(div);

    // Detecta quando o usuário fecha a janela
    const timer = setInterval(() => { if (win.closed) onClose(); }, 500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win]);

  return container ? createPortal(children, container) : null;
}
