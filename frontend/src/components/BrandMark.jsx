export default function BrandMark({ size = 78, wordmark = false, className = '' }) {
  const mark = (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* V = body/tail. The right shoulder deliberately reads as a compact flexed arm turned
          inward, while the angular forearm/head keeps the monitor-lizard character without an
          eye or round snake head. */}
      <path d="M78 91 215 392c15 34 66 34 82 0L434 91h-95l-83 198-84-198Z" fill="currentColor" />
      <path d="M300 184c21-43 49-68 82-76 18-4 34-2 49 5l18-15 30 24-24 26c10 12 16 26 17 42l-43 12c-5-18-16-30-32-37-18-8-36-7-53 3-15 9-28 24-38 45l-25-18Z" fill="currentColor" />
      <path d="M371 157c13-9 28-12 45-8l-18 17c-10-2-19-5-27-9Z" fill="var(--bg,#090b0d)" />
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
