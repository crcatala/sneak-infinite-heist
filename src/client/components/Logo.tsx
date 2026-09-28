// The "Sneak! Infinite Heist" wordmark: chunky gold SNEAK! wearing a domino mask (with eyes that
// blink and glance around), over a coral ribbon. Idle animation: float, sheen sweep, "!" wobble,
// blinking. Pure SVG + CSS (title.css), so it's crisp at any size and costs nothing to render.

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <svg className={`logo ${compact ? "compact" : ""} ${className}`} viewBox="0 0 640 290" role="img" aria-label="Sneak! Infinite Heist">
      <defs>
        <linearGradient id="lg-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.45" stopColor="#ffc14d" />
          <stop offset="1" stopColor="#f08a14" />
        </linearGradient>
        <linearGradient id="lg-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="lg-ribbon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff7a90" />
          <stop offset="1" stopColor="#e8385a" />
        </linearGradient>
        <clipPath id="lg-letters">
          <text x="40" y="172" fontFamily="Bungee, Fredoka, sans-serif" fontSize="150" textLength="490" lengthAdjust="spacingAndGlyphs">
            SNEAK
          </text>
        </clipPath>
      </defs>

      <g className="logo-float" aria-hidden="true">
        {/* extrusion */}
        {[10, 8, 6, 4, 2].map((d) => (
          <text key={d} x={40 + d * 0.4} y={172 + d} fontFamily="Bungee, Fredoka, sans-serif" fontSize="150" textLength="490" lengthAdjust="spacingAndGlyphs" fill={d > 6 ? "#07061a" : "#3a2466"}>
            SNEAK
          </text>
        ))}
        <text x="40" y="172" fontFamily="Bungee, Fredoka, sans-serif" fontSize="150" textLength="490" lengthAdjust="spacingAndGlyphs" fill="url(#lg-gold)" stroke="#07061a" strokeWidth="6" paintOrder="stroke" strokeLinejoin="round">
          SNEAK
        </text>
        {/* sheen sweep, clipped to the letters */}
        <g clipPath="url(#lg-letters)">
          <rect className="logo-sheen" x="-160" y="30" width="120" height="170" fill="url(#lg-sheen)" transform="skewX(-20)" />
        </g>

        {/* the "!" wobbles on its own */}
        <g className="logo-bang">
          {[10, 6, 2].map((d) => (
            <text key={d} x={540 + d * 0.4} y={172 + d} fontFamily="Bungee, Fredoka, sans-serif" fontSize="150" fill={d > 6 ? "#07061a" : "#3a2466"}>
              !
            </text>
          ))}
          <text x="540" y="172" fontFamily="Bungee, Fredoka, sans-serif" fontSize="150" fill="url(#lg-gold)" stroke="#07061a" strokeWidth="6" paintOrder="stroke">
            !
          </text>
        </g>

        {/* domino mask across "EA" */}
        <g className="logo-mask">
          <path d="M214 104 C 250 88, 380 88, 416 104 C 420 124, 408 142, 386 142 C 352 142, 336 126, 315 126 C 294 126, 278 142, 244 142 C 222 142, 210 124, 214 104 Z" fill="#1b1834" stroke="#ffc14d" strokeWidth="4" />
          <path d="M214 104 L 196 96 M416 104 L 434 96" stroke="#1b1834" strokeWidth="8" strokeLinecap="round" />
          <g className="logo-eyes">
            <ellipse cx="262" cy="116" rx="21" ry="13" fill="#fff5dc" />
            <ellipse cx="368" cy="116" rx="21" ry="13" fill="#fff5dc" />
            <g className="logo-pupils">
              <circle cx="265" cy="117" r="7" fill="#07061a" />
              <circle cx="371" cy="117" r="7" fill="#07061a" />
            </g>
          </g>
        </g>

        {/* ribbon */}
        <g className="logo-ribbon">
          <path d="M70 212 L40 214 L56 236 L40 258 L96 256 Z" fill="#b81e3e" />
          <path d="M570 212 L600 214 L584 236 L600 258 L544 256 Z" fill="#b81e3e" />
          <path d="M84 200 Q 320 180 556 200 L 556 250 Q 320 230 84 250 Z" fill="url(#lg-ribbon)" stroke="#07061a" strokeWidth="5" strokeLinejoin="round" />
          <text x="320" y="236" textAnchor="middle" fontFamily="Fredoka, Nunito, sans-serif" fontWeight="700" fontSize="34" letterSpacing="7" fill="#fff" stroke="#7a1030" strokeWidth="3" paintOrder="stroke">
            INFINITE ∞ HEIST
          </text>
        </g>
      </g>
    </svg>
  );
}
