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
          <stop offset="1" stopColor="currentColor" stopOpacity=".72" />
        </linearGradient>
      </defs>
      <path d="M13 18 42.8 78.5c2.1 4.2 8.2 4.2 10.3 0L83 18H68.4L48 61.9 27.6 18Z" fill="url(#vgMark)" />
      <path d="M58.5 28.8c7.6-5.6 14.7-7.3 21.3-5.3-5.8 1.8-10.5 5.3-14.1 10.6-2.7-.8-5.1-2.6-7.2-5.3Z" fill="currentColor" opacity=".92" />
      <circle cx="69.3" cy="27.8" r="2.1" fill="var(--bg,#000)" />
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
