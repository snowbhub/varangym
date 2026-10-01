export default function BrandMark({ size = 78, wordmark = false, className = '' }) {
  const mark = (
    <svg viewBox="0 0 96 96" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="vgMark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5BE67B" />
          <stop offset=".55" stopColor="#48D86F" />
          <stop offset="1" stopColor="#2FC45A" />
        </linearGradient>
      </defs>
      {/* One silhouette: a broad biceps-like left shoulder narrows into the bottom of the V,
          then rises as a forearm. The forearm finishes in a compact angular monitor-lizard head
          instead of a fist. It stays readable as a V at favicon size. */}
      <path d="M15.5 17.5C8.2 15.7 4.4 21.8 7.8 29.2L38.4 82.1C42.8 89.8 53.2 89.9 57.8 82.4L76.2 51.9C79.8 45.9 82.7 40.8 84.8 36.6L77.5 30.7C73.6 34.5 69.7 39.8 66.2 45.7L49.4 73.1L27.9 25.5C25.3 19.7 21.2 16.5 15.5 17.5Z" fill="url(#vgMark)"/>
      {/* Varan head replacing the fist: low forehead, eye ridge and short blunt snout. */}
      <path d="M73.1 34.5L76.8 20.7L86.7 16.8L93 20.7L88.6 24.8L93.7 27.9L87.7 32.2L79.5 31.4L76.9 38.1Z" fill="url(#vgMark)"/>
      <path d="M79.2 24.2L87.6 22.7L84.8 26.2L78.4 27.1Z" fill="rgba(0,0,0,.22)"/>
      <circle cx="86.2" cy="22.6" r="1.65" fill="#080A0C"/>
      {/* Small muscle crease so the left stroke reads like a flexed arm, not a snake/body. */}
      <path d="M14.2 25.3C20.1 23.2 25.4 26.8 29 34.8" fill="none" stroke="rgba(255,255,255,.24)" strokeWidth="2.25" strokeLinecap="round"/>
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
