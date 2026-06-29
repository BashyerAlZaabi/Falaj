/*
 * FALAJ Page Header — User-Friendly
 * Design: Bigger back button (48px touch target), breadcrumb trail, clear title
 */
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";

interface PageHeaderProps {
  title: string;
  showBack?: boolean;
  breadcrumb?: string;
  rightAction?: React.ReactNode;
  backPath?: string;
}

export default function PageHeader({ title, showBack = true, breadcrumb, rightAction, backPath }: PageHeaderProps) {
  const [, setLocation] = useLocation();

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-border/30">
      <div className="max-w-[480px] mx-auto flex items-center gap-2 px-3 h-14">
        {showBack && (
          <button
            onClick={() => backPath ? setLocation(backPath) : (window.history.length > 1 ? window.history.back() : setLocation("/dashboard"))}
            className="p-2.5 rounded-xl hover:bg-muted transition-colors active:scale-95 shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          {breadcrumb && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground -mb-0.5">
              <span>{breadcrumb}</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          )}
          <h1 className="text-base font-bold truncate">{title}</h1>
        </div>
        {rightAction && <div className="shrink-0">{rightAction}</div>}
      </div>
    </header>
  );
}
