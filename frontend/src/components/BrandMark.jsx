export default function BrandMark({ size = 78, wordmark = false, className = '' }) {
  const mark = (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="vgMark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="currentColor" />
          <stop offset="1" stopColor="currentColor" stopOpacity=".76" />
        </linearGradient>
      </defs>
      {/* The V is the body/tail. Its right shoulder grows into a compact flexed-arm silhouette.
          The short angular snout keeps the monitor-lizard reference without an eye/head that reads
          as a snake. */}
      <path d="M13 18 42.7 78.4c2.2 4.4 8.5 4.4 10.7 0L72.9 36H59.5L48 61.2 27.8 18Z" fill="url(#vgMark)" />
      <path d="M57.8 36.3c2.3-9.7 8.3-16.8 18.1-20.9 4-1.7 8.6-1.9 13.1-.7l-6 7.1c-3.8-.5-7 .3-9.8 2.2l8.9 3.2-5.6 7.5-8.2-2.7c-1.7 3-2.6 6.2-2.8 9.8-3.4-.8-5.9-2.6-7.7-5.5Z" fill="currentColor" />
      <path d="M73.4 24.1c-4.7 2.4-7.8 6.3-9.4 11.8" fill="none" stroke="var(--bg,#000)" strokeWidth="2.7" strokeLinecap="round" opacity=".9" />
    </svg>
  )

  if (!wordmark) return mark
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      {mark}
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontSize: Math.max(20, size * .34), fontWeight: 900, letterSpacing: '.16em', lineHeight: 1 }}>VARANGYM</div>
        <div style={{ marginTop: 7, fontSize: Math.max(9, size * .13), letterSpacing: '.18em', color: 'var(--label-3)', textTransform: 'uppercase' }}>plan · train · progress</div>
      </div>
    </div>
  )
}
