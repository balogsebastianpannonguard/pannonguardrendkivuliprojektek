export type Mood = "idle" | "think" | "talk" | "happy";

import { useId } from "react";

/**
 * Pajzsi, a Rendkívüli projekt okos védőangyala: lime pajzs-test, tetején pink villám-jelvény, csillogó „szikra-szemek”,
 * a feje körül keringő műholdpályával. Pislog; gondolkodáskor a műhold felgyorsul és a szeme felfelé néz,
 * beszéléskor mozog a szája, örömkor mosolygó szemei és szikrái vannak. Tiszta SVG.
 */
export function Mascot({ size = 56, mood = "idle", float = false }: { size?: number; mood?: Mood; float?: boolean }) {
  // Egyedi azonosító a színátmenetekhez, hogy több figura egymás mellett se ütközzön.
  const id = `pzi${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const look = mood === "think" ? { x: 1.1, y: -1.3 } : { x: 0.5, y: 0.4 };
  const eye = (cx: number) => (
    <g className="pg-blink">
      <ellipse cx={cx} cy="36" rx="4.6" ry="5.2" fill="#0b100c" />
      <circle cx={cx + look.x} cy={36 + look.y} r="2.7" fill={`url(#${id}e)`} />
      <circle cx={cx + 1.3 + look.x} cy={34.4 + look.y} r="1.1" fill="#fff" />
      <path d={`M${cx - 1.8 + look.x} ${37.6 + look.y}l1 -1.5 1 1.5-1 -0.4Z`} fill="#fff" opacity="0.8" />
    </g>
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Pajzsi, a Rendkívüli projekt okos védőangyala"
      className={float ? "pg-float" : undefined}
      overflow="visible"
    >
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#f0ffb8" />
          <stop offset="0.45" stopColor="#c6f432" />
          <stop offset="1" stopColor="#121a12" />
        </linearGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f8ffdc" />
          <stop offset="1" stopColor="#a8d61a" />
        </linearGradient>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9cc3" />
          <stop offset="1" stopColor="#ff3d8b" />
        </linearGradient>
        <radialGradient id={`${id}e`} cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#5ee6ff" />
          <stop offset="1" stopColor="#c6f432" />
        </radialGradient>
        <radialGradient id={`${id}s`} cx="0.3" cy="0.2" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* keringő pálya a háttérben */}
      <ellipse cx="32" cy="33" rx="29" ry="10.5" transform="rotate(-18 32 33)" fill="none" stroke="#c6f432" strokeOpacity="0.4" strokeWidth="1" strokeDasharray="2 3" />

      {/* pajzs-test */}
      <path
        d="M32 8 55 15v16c0 14.5-9.8 24-23 28C18.8 55 9 45.5 9 31V15L32 8Z"
        fill={`url(#${id}b)`}
        stroke={`url(#${id}g)`}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path d="M32 11.5 51.5 17.5v13.5c0 12.5-8.4 20.4-19.5 24" fill="none" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="22" cy="22" rx="12" ry="9" fill={`url(#${id}s)`} />

      {/* villám-jelvény */}
      <g className={mood === "happy" ? "pg-dot" : undefined}>
        <path d="M34.5 1.5 26.5 13h5l-2 7.5 9-12h-5.2Z" fill={`url(#${id}p)`} stroke="#0b100c" strokeOpacity="0.35" strokeWidth="0.8" strokeLinejoin="round" />
      </g>

      {/* szemek */}
      {mood === "happy" ? (
        <>
          <path d="M19.5 37c1.4-3.4 5.6-3.4 7 0" fill="none" stroke="#0b100c" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M37.5 37c1.4-3.4 5.6-3.4 7 0" fill="none" stroke="#0b100c" strokeWidth="2.6" strokeLinecap="round" />
        </>
      ) : (
        <>
          {eye(23.5)}
          {eye(40.5)}
        </>
      )}
      {mood === "think" && <path d="M36.5 27.5c2-1.6 5-1.8 7.2-.4" fill="none" stroke="#0b100c" strokeWidth="1.8" strokeLinecap="round" />}

      {/* pír és száj */}
      <ellipse cx="17.5" cy="44" rx="3" ry="2" fill="#ff3d8b" opacity={mood === "happy" ? 0.85 : 0.5} />
      <ellipse cx="46.5" cy="44" rx="3" ry="2" fill="#ff3d8b" opacity={mood === "happy" ? 0.85 : 0.5} />
      {mood === "talk" ? (
        <ellipse className="pg-talk" cx="32" cy="47.5" rx="3.4" ry="3" fill="#7a0f3d" stroke="#0b100c" strokeWidth="1.4" />
      ) : mood === "think" ? (
        <path d="M28.5 47.5h7" stroke="#0b100c" strokeWidth="2.2" strokeLinecap="round" />
      ) : (
        <path d="M26.5 45.5c2.2 3.4 8.8 3.4 11 0" fill="#7a0f3d" stroke="#0b100c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      )}

      {/* keringő műhold */}
      <g transform="rotate(-18 32 33)">
        <g className={`pg-orbit ${mood === "think" ? "pg-orbit-fast" : ""}`}>
          <circle cx="61" cy="33" r="3" fill="#ff3d8b" />
          <circle cx="61" cy="33" r="1.1" fill="#fff" />
        </g>
      </g>

      {/* gondolkodás pöttyei és örömszikrák */}
      {mood === "think" && (
        <g fill="#ff9cc3">
          {[0, 1, 2].map((n) => (
            <circle key={n} className="pg-dot" cx={46 + n * 5.5} cy={7 - n * 2} r={1.6 + n * 0.5} style={{ animationDelay: `${n * 0.2}s` }} />
          ))}
        </g>
      )}
      {mood === "happy" && (
        <g fill="#f0ffb8">
          <path className="pg-dot" d="M54 14l1.6 3.4 3.4 1.6-3.4 1.6L54 24l-1.6-3.4L49 19l3.4-1.6L54 14Z" />
          <path className="pg-dot" style={{ animationDelay: "0.4s" }} d="M9 18l1.1 2.4 2.4 1.1-2.4 1.1L9 25l-1.1-2.4L5.5 21.5l2.4-1.1L9 18Z" />
        </g>
      )}
    </svg>
  );
}
