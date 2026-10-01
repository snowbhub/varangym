export default function BrandMark({ size = 78, wordmark = false, className = '' }) {
  const mark = <img src="/varangym-180.png?v=11" width={size} height={size} className={`vg-brand-image ${className}`} alt="" aria-hidden="true" />

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
