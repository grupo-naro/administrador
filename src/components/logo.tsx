// Marca de Grupo Naro (misma "N" que el ícono de gruponaro.com.ar).
// `dark`: cuadrado tinta con la N blanca (para fondos claros).
// `light`: cuadrado claro con la N tinta (para la barra lateral oscura).
type Tone = "dark" | "light";

const TONES: Record<Tone, { square: string; letter: string }> = {
  dark: { square: "#1C2737", letter: "#FFFFFF" },
  light: { square: "#F6F8FB", letter: "#1C2737" },
};

export function LogoMark({ tone = "dark", className }: { tone?: Tone; className?: string }) {
  const { square, letter } = TONES[tone];
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="Grupo Naro">
      <rect width="40" height="40" rx="9" fill={square} />
      <g transform="translate(6 6) scale(0.7)">
        <path d="M11 6 L31 33" stroke={letter} strokeWidth="8.5" strokeLinecap="round" fill="none" />
        <rect x="27" y="4" width="8.5" height="32" rx="4.25" fill={letter} />
        <rect x="4" y="25.5" width="11" height="11" rx="3.5" fill="#1E56F0" />
      </g>
    </svg>
  );
}

export function Logo({ tone = "dark", className }: { tone?: Tone; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark tone={tone} className="size-8 shrink-0" />
      <span className="text-base font-bold tracking-tight">Grupo Naro</span>
    </span>
  );
}
