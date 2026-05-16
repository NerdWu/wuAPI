import { BarChart3, BookOpen, ExternalLink, FileText, KeyRound, Layers, LogOut, Power, Route, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Toaster } from 'sonner';
import { cn } from '@/lib/utils';
import type { AdminStatus, AppSettings, ProxyStatus } from '@/types';

export type MainPage = 'apiPool' | 'channels' | 'tokens' | 'logs' | 'dashboard' | 'translator' | 'settings' | 'guide';

const NAV_ITEMS: { key: MainPage; icon: typeof Layers; labelKey: string }[] = [
  { key: 'apiPool', icon: Layers, labelKey: 'nav.apiPool' },
  { key: 'channels', icon: Route, labelKey: 'nav.channels' },
  { key: 'tokens', icon: KeyRound, labelKey: 'nav.tokens' },
  { key: 'logs', icon: FileText, labelKey: 'nav.logs' },
  { key: 'dashboard', icon: BarChart3, labelKey: 'nav.dashboard' },
  { key: 'settings', icon: Settings, labelKey: 'nav.settings' },
];

const starImageSrc = `${import.meta.env.BASE_URL}star.jpg`;
const brandImageSrc = `${import.meta.env.BASE_URL}衍泽.ico`;

export interface MainShellProps {
  currentPage: MainPage;
  proxyStatus?: ProxyStatus | null;
  adminStatus?: AdminStatus | null;
  settings?: AppSettings | null;
  updateInfo?: { current: string; latest: string; url: string } | null;
  onUpdateDismiss?: () => void;
  onUpdateOpen?: (url: string) => void;
  onNavigate: (page: MainPage) => void;
  onOpenGuide?: (path: string) => void;
  onLogout?: () => void;
  desktopMode?: boolean;
  renderPage: () => React.ReactNode;
  children?: React.ReactNode;
}

export function MainShell({
  currentPage,
  proxyStatus,
  adminStatus,
  settings,
  updateInfo,
  onUpdateDismiss,
  onUpdateOpen,
  onNavigate,
  onOpenGuide,
  onLogout,
  desktopMode = false,
  renderPage,
  children,
}: MainShellProps) {
  const { t, i18n } = useTranslation();

  const guidePath = i18n.language.startsWith('zh') ? 'GUIDE_CN.md' : 'GUIDE.md';

  return (
    <div className="flex h-screen flex-col bg-background">
      {updateInfo && (
        <div className="flex shrink-0 items-center justify-center gap-2 bg-primary/10 px-3 py-1.5 text-xs text-primary">
          <span>{t('update.newVersion', { version: updateInfo.latest })}</span>
          <button
            type="button"
            onClick={() => onUpdateOpen?.(updateInfo.url)}
            className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
          >
            {t('update.goDownload')}
            <ExternalLink className="h-3 w-3" />
          </button>
          <button type="button" onClick={onUpdateDismiss} className="ml-1 opacity-60 hover:opacity-100">
            ×
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'flex flex-col border-r border-sidebar-border bg-sidebar-background',
            desktopMode ? 'w-40' : 'w-56',
          )}
        >
          <div className={cn('flex items-center gap-2 border-b border-sidebar-border', desktopMode ? 'px-3 py-3' : 'px-4 py-4')}>
            <Power className={cn('shrink-0', desktopMode ? 'h-4 w-4' : 'h-5 w-5', proxyStatus?.running ? 'text-green-500' : 'text-red-500')} />
            <span className={cn('font-semibold tracking-tight', desktopMode ? 'text-sm' : 'text-lg')}>
              {proxyStatus?.running ? `wuAPI:${proxyStatus.port}` : 'wuAPI'}
            </span>
          </div>

          <ScrollArea className={cn('flex-1', desktopMode ? 'px-2 py-4' : 'px-2 py-2')}>
            <nav className={cn('flex flex-col', desktopMode ? 'gap-4' : 'gap-1')}>
              {NAV_ITEMS.map(({ key, icon: Icon, labelKey }) => (
                <Button
                  key={key}
                  variant={currentPage === key ? 'secondary' : 'ghost'}
                  className={cn(
                    desktopMode ? 'h-11 justify-start gap-2 px-3' : 'justify-start gap-2 px-3',
                    currentPage === key && 'bg-sidebar-accent text-sidebar-accent-foreground',
                  )}
                  onClick={() => onNavigate(key)}
                >
                  <Icon className="h-4 w-4" />
                  {t(labelKey)}
                </Button>
              ))}

              {!desktopMode && (
                <>
                  <Separator className="my-1" />
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2 px-3"
                    onClick={() => onOpenGuide?.(guidePath)}
                  >
                    <BookOpen className="h-4 w-4" />
                    {t('nav.guide', '使用指南')}
                  </Button>
                </>
              )}

              {onLogout && (
                <>
                  <Separator className="my-1" />
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2 px-3 text-red-500 hover:text-red-500"
                    onClick={onLogout}
                  >
                    <LogOut className="h-4 w-4" />
                    {t('nav.logout', '退出登录')}
                  </Button>
                </>
              )}
            </nav>
          </ScrollArea>

          <div className={cn('border-t border-sidebar-border', desktopMode ? 'pb-4 pt-2' : 'px-2 pb-4 pt-3')}>
            {desktopMode ? (
              <>
                <div className="pb-4 pl-0 pr-[20%] pt-2">
                  <img src={brandImageSrc} alt="wuAPI" className="w-full object-contain" />
                </div>
                <div className="px-2 text-xs text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <span className={cn('inline-block h-2.5 w-2.5 rounded-full', proxyStatus?.running ? 'bg-green-500' : 'bg-red-500')} />
                    {adminStatus ? (
                      <span className={cn('inline-block h-2.5 w-2.5 rounded-full', adminStatus.running ? 'bg-green-500' : 'bg-red-500')} />
                    ) : null}
                    <span>{settings?.app_version || '0.0.0'}</span>
                  </div>
                  <div className="mt-3 flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-muted-foreground"
                      onClick={() => onOpenGuide?.(guidePath)}
                    >
                      <BookOpen className="mr-1 h-3.5 w-3.5" />
                      使用指南
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-center">
                  <a href="https://github.com/NerdWu/wuAPI" target="_blank" rel="noopener noreferrer">
                    <img src={starImageSrc} alt="Star on GitHub" className="cursor-pointer transition-opacity hover:opacity-80" />
                  </a>
                </div>
                <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <span className={cn('inline-block h-4 w-4 rounded-full', proxyStatus?.running ? 'bg-green-500' : 'bg-red-500')} />
                  <span className={cn('inline-block h-4 w-4 rounded-full', adminStatus?.running ? 'bg-green-500' : 'bg-red-500')} />
                  <span>版本号：{settings?.app_version || '0.0.0'}</span>
                </div>
              </>
            )}
          </div>
        </aside>

        <main className="flex-1 overflow-auto">{renderPage()}</main>
        {children}
      </div>

      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}
