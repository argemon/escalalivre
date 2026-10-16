/** Calendar mark selected for Escala Livre. Geometry matches public/brand/icon.svg. */
export function Brand({ className = "" }: { className?: string }) {
  return (
    <span className={`brand ${className}`}>
      <svg className="brand-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
        <path d="M25 19H39M15 19H14C8.477 19 4 23.477 4 29V49C4 54.523 8.477 59 14 59H50C55.523 59 60 54.523 60 49V45M49 19H50C55.523 19 60 23.477 60 29V32" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="butt" strokeLinejoin="round"/>
  <path d="M20 11V22M44 11V22" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/>
  <rect x="18" y="32" width="20" height="20" rx="4" fill="#53b58a"/>
      </svg>
      <span className="brand-name">Escala Livre</span>
    </span>
  );
}
