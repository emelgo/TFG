import { cn } from '@pymekit/ui/utils';

export function AuthLayoutShell({
  children,
  className,
  Logo,
  contentClassName,
}: React.PropsWithChildren<{
  Logo?: React.ComponentType;
  className?: string;
  contentClassName?: string;
}>) {
  return (
    <div
      className={cn(
        'bg-muted/30 animate-in fade-in slide-in-from-top-16 zoom-in-95 flex h-screen flex-col items-center justify-center gap-y-8 duration-1000',
        className,
      )}
    >
      {Logo ? <Logo /> : null}

      <div
        className={cn(
          'bg-background flex w-full max-w-[22rem] flex-col gap-y-5 rounded-lg p-6 md:w-8/12 lg:w-5/12 lg:px-8 xl:w-4/12',
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
