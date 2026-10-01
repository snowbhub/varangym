export default function BrandMark({ size = 78, wordmark = false, className = '' }) {
  const mark = (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="116" fill="#090b0d" />
      <path fill="#32e56d" d="M78 88h70l116 261c7 17 17 25 29 25 12 0 23-8 31-24l18-35 58 30-57 78c-22 30-52 43-87 38-33-5-57-25-71-58L69 108Z" />
      <path d="M291 379c26-35 44-70 62-104 20-39 42-70 76-92" fill="none" stroke="#32e56d" strokeWidth="66" strokeLinecap="round" strokeLinejoin="round" />
      <path fill="#32e56d" d="M400 166l31-16-7-23 31-16 34 7-14 17 29 11-25 14 25 10-27 27-39-13-27 13-15-19Z" />
      <circle cx="461" cy="137" r="5" fill="#090b0d" />
      <circle cx="490" cy="157" r="3" fill="#090b0d" />
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
