import logo from "@/assets/ouderschap-co-logo.png.asset.json";

/** One supplied brand asset for the parent and professional experiences. */
export function AppLogo({ className = "", slogan = false }: { className?: string; slogan?: boolean }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="rounded-md dark:bg-logo-surface dark:p-2">
        <img src={logo.url} alt="Ouderschap & Co" width={1507} height={468} className="block h-auto w-full" />
      </div>
      {slogan ? <p className="mt-2 text-center text-xs text-ink-soft">De app die ouders verbindt</p> : null}
    </div>
  );
}