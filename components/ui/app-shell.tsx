'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { DesktopSidebar } from '@/components/ui/desktop-sidebar';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname() || '';

  // Rotas públicas ou telas de autenticação onde a barra lateral não deve aparecer
  const isExcluded =
    pathname === '/login' ||
    pathname === '/admin/login' ||
    pathname === '/super-admin/login' ||
    pathname.startsWith('/super-admin') ||
    pathname === '/';

  if (isExcluded) {
    return <div className="flex-1 flex flex-col relative w-full">{children}</div>;
  }

  return (
    <div className="flex-1 w-full max-w-[1536px] mx-auto px-0 lg:px-6 py-0 lg:py-6 flex gap-6 lg:gap-8 items-start min-h-[calc(100vh-3.5rem)]">
      {/* Barra lateral fixa no desktop */}
      <DesktopSidebar />

      {/* Conteúdo principal da tela */}
      <div className="flex-1 flex flex-col min-w-0 w-full">
        {children}
      </div>
    </div>
  );
}
