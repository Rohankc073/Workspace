/**
 * Atlas logo.
 *
 * The mark is a folded map: three panels, one fold. It's drawn on a 40×40
 * grid and scaled, so it stays crisp at any size and survives being
 * flattened to a favicon.
 *
 * Both pieces use `currentColor`, so colour comes from whatever wraps them —
 * blue on white in the sidebar, white on blue inside the tile. Nothing here
 * hardcodes a colour except <LogoTile>, which needs a background.
 */

/** The mark on its own — no tile, no background. */
export function LogoMark({ size = 24, strokeWidth = 2.6 }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      <path
        d="M8 11 L20 16 L32 11 L32 29 L20 34 L8 29 Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M20 16 L20 34"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The mark in a rounded tile — the sidebar and login-card treatment.
 * Stroke thickens slightly at small sizes so the fold doesn't disappear.
 */
export function LogoTile({ size = 32, radius, background = "var(--accent)" }) {
  const r = radius ?? Math.round(size * 0.26);
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <LogoMark
        size={Math.round(size * 0.62)}
        strokeWidth={size <= 28 ? 3.2 : 2.8}
      />
    </span>
  );
}

/** Tile plus wordmark, for the sidebar header and the login card. */
export function Logo({ size = 32, showName = true, nameSize }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
      <LogoTile size={size} />
      {showName ? (
        <span
          style={{
            fontSize: nameSize ?? Math.round(size * 0.64),
            fontWeight: 400,
            color: "var(--text-2)",
            letterSpacing: "-0.01em",
          }}
        >
          Atlas
        </span>
      ) : null}
    </span>
  );
}

export default Logo;
