/**
 * عدّاد قوسي — لعرض الجاهزية ونسب التقدّم (المرحلة، خطة الاستفادة…).
 * SVG صرف بلا حركة إلزامية؛ الانتقال يحترم prefers-reduced-motion عبر globals.
 */
export function ArcGauge({
  value,
  label,
  size = 120,
  dark = false,
}: {
  /** 0..100 */
  value: number;
  label?: string;
  size?: number;
  /** على سطح داكن؟ يقلب ألوان المسار والنص */
  dark?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = 10;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // قوس 270° يبدأ من 135° — فتحة للأسفل
  const arcLen = 2 * Math.PI * r * 0.75;
  const filled = arcLen * (clamped / 100);

  const track = dark ? "rgba(238,240,228,.15)" : "var(--ink-24)";
  const fill = dark ? "var(--brass-l)" : "var(--brass)";
  const text = dark ? "var(--nacre)" : "var(--ink)";
  const sub = dark ? "rgba(238,240,228,.55)" : "var(--ink-45)";

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label ? `${label}: ${clamped}٪` : `${clamped}٪`}
    >
      <g transform={`rotate(135 ${cx} ${cy})`}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${2 * Math.PI * r}`}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={fill}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${2 * Math.PI * r}`}
          className="transition-[stroke-dasharray] duration-700 ease-e"
        />
      </g>
      <text
        x={cx}
        y={label ? cy - 2 : cy + 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={text}
        fontSize={size * 0.22}
        fontWeight={600}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {clamped}
        <tspan fontSize={size * 0.12} fill={sub}>
          ٪
        </tspan>
      </text>
      {label && (
        <text
          x={cx}
          y={cy + size * 0.17}
          textAnchor="middle"
          fill={sub}
          fontSize={size * 0.1}
        >
          {label}
        </text>
      )}
    </svg>
  );
}
