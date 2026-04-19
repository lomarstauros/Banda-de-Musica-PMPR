import type {Metadata} from 'next';
import './globals.css'; // Global styles
import FirebaseProvider from '@/components/providers/firebase-provider';
import NotificationInitializer from '@/components/notifications/notification-initializer';

export const metadata: Metadata = {
  title: 'Banda de Música PMPR',
  description: 'Gerenciamento de escalas de serviço',
  manifest: '/manifest.json',
  themeColor: '#1e293b',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Banda PMPR',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <link rel="icon" href="/brasao_banda.png" />
        <link rel="apple-touch-icon" href="/brasao_banda.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@300;400;500;600;700;800&family=Spline+Sans:wght@300;400;500;600;700&family=Noto+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning className="bg-background-light dark:bg-background-dark font-sans antialiased text-slate-900 dark:text-white flex flex-col min-h-screen">
        <FirebaseProvider>
          <NotificationInitializer />
          <div className="flex-1 flex flex-col relative w-full">
            {children}
          </div>
          <footer className="w-full py-3 mt-auto text-center text-[11px] sm:text-xs text-slate-500/80 dark:text-slate-400/80 bg-background-light/50 dark:bg-background-dark/50 backdrop-blur-sm relative z-50 border-t border-slate-200/50 dark:border-slate-800/50">
            <p className="font-medium tracking-wide">&copy; {new Date().getFullYear()} Stauros Studios&reg;. Todos os direitos reservados.</p>
          </footer>
        </FirebaseProvider>
      </body>
    </html>
  );
}
