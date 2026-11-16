const PALETTE = ["from-volt to-azure", "from-ember to-volt-bright", "from-azure to-ember", "from-volt-bright to-ember", "from-cream to-volt"];

/** Kis kör a név kezdőbetűivel; a szín a névből adódik, így mindig ugyanaz marad. */
export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  const hash = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (
    <span
      title={name}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
      className={`grid shrink-0 place-items-center rounded-full bg-linear-to-br ${PALETTE[hash % PALETTE.length]} font-display font-bold text-ink-950 uppercase`}
    >
      {initials || "?"}
    </span>
  );
}
