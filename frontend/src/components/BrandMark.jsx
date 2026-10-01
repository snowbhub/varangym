export default function BrandMark({ size = 78, wordmark = false, className = '' }) {
  const mark = (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="vgMark" x1=".05" y1="0" x2=".95" y2="1">
          <stop offset="0" stopColor="#79D484" />
          <stop offset=".52" stopColor="#62BB6C" />
          <stop offset="1" stopColor="#49A957" />
        </linearGradient>
      </defs>
      {/* One compact silhouette. The left stroke is a flexed upper-arm/biceps mass, the low point
          reads as an elbow, and the right stroke rises like a forearm. The fist is deliberately
          replaced by an angular monitor-lizard head, so the first read is still a strong V. */}
      <path fill="url(#vgMark)" d="M108 73C73 68 42 88 36 119C32 140 41 161 57 184L184 396C200 423 234 432 259 416C275 406 285 391 293 372L365 185C374 163 386 148 401 139L420 151L451 144L476 119L448 105L461 86L434 72L397 76L377 102C352 109 334 130 321 159L251 327L164 121C153 94 134 77 108 73Z" />
      {/* A restrained muscle crease hints at 💪 without turning the logo into a literal arm. */}
      <path d="M59 126C70 96 107 86 137 102C148 108 155 116 161 127" fill="none" stroke="#C4F1CB" strokeWidth="10" strokeLinecap="round" opacity=".28" />
      {/* Aggressive varan brow/eye; these details remain legible at favicon size. */}
      <path fill="#090B0D" d="M401 100L438 89L431 111L403 116Z" />
      <circle cx="431" cy="91" r="7.5" fill="#090B0D" />
      <path d="M424 130L454 126" stroke="#18351E" strokeWidth="7" strokeLinecap="round" opacity=".55" />
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
