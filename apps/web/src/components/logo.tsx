/** Original mark for this project: three rising skill bars with a verified dot. Not derived from any university emblem. */
export function LogoMark({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="Placement Skill Matcher logo">
      <defs>
        <linearGradient id="lm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff8a2a" /><stop offset="1" stopColor="#c2410c" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#lm-g)" />
      <rect x="9" y="22" width="5" height="9" rx="1.6" fill="#fff" opacity=".7" />
      <rect x="17.5" y="16" width="5" height="15" rx="1.6" fill="#fff" opacity=".85" />
      <rect x="26" y="10" width="5" height="21" rx="1.6" fill="#fff" />
      <circle cx="28.5" cy="6.5" r="2.4" fill="#1b2a4e" stroke="#fff" strokeWidth="1.2" />
    </svg>
  );
}
