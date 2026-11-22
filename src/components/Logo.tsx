export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 72" className={className} aria-hidden="true">
      <circle cx="18" cy="12" r="9" className="fill-pink" />
      <circle cx="36" cy="10" r="6" className="fill-pink" />
      <circle cx="48" cy="22" r="9" className="fill-cyan" />
      <circle cx="12" cy="30" r="8" className="fill-cyan" />
      <circle cx="30" cy="28" r="10" className="fill-primary" />
      <circle cx="16" cy="46" r="8" className="fill-pink" />
      <circle cx="40" cy="44" r="6" className="fill-pink" />
      <path d="M10 50 L54 50 L32 70 Z" fill="none" className="stroke-chart-4" strokeWidth="2" />
      <path d="M17 50 L32 64 M27 50 L40 62 M37 50 L46 58 M47 50 L24 62 M37 50 L20 58" className="stroke-chart-4" strokeWidth="1.2" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark />
      <div className="leading-tight" dir="ltr">
        <div className={`font-bold tracking-wider text-lg ${light ? "text-sidebar-accent-foreground" : "text-foreground"}`}>ICE LAND</div>
        <div className={`text-[10px] tracking-[0.18em] ${light ? "text-sidebar-primary" : "text-primary"}`}>IS ALWAYS A GOOD IDEA</div>
      </div>
    </div>
  );
}
