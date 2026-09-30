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
          <stop offset="1" stopColor="currentColor" stopOpacity=".78" />
        </linearGradient>
      </defs>
      {/* V = torso/tail. The right shoulder bends back like a flexed arm, while the compact
          angular tip still reads as a monitor-lizard head. No round eye/head silhouette, so the
          mark avoids the old snake look. */}
      <path d="M12 17h21.5L48.5 61 61 31h15L54.5 79.5c-2.3 5.1-9.6 5.1-12 0Z" fill="url(#vgMark)" />
      <path d="M57.5 43.5c1.8-8.5 5.9-15.5 12.3-19.6 3.4-2.2 7.2-3.4 11.2-3.6l4.5-4.2 7.3 4.3-5.2 5 6.1 3.2-4.8 5.6-7.2-1.1c-3.6-3-7.3-3.8-10.6-1.8-2.8 1.7-4.9 4.5-6.2 8.5l7.9-3.4c5.8-2.4 11.4-.4 15.2 4.7l-4.1 7.2c-5.4 2.4-11.2 1.9-16.2-1.1l-6.6-4Z" fill="currentColor" />
      <path d="M72.2 30.8c-3.6 2.4-6 5.8-7.1 10.3" fill="none" stroke="var(--bg,#000)" strokeWidth="2.8" strokeLinecap="round" opacity=".92" />
      <path d="m86.2 24.2 2.3 1-2.1 1.3-1.7-1.2Z" fill="var(--bg,#000)" opacity=".95" />
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
