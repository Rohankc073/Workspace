// Shared presence logic. "Online" means active within the last 2 minutes;
// otherwise we show a relative "Last seen …" label.

const ONLINE_MS = 2 * 60 * 1000;

export function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_MS;
}

/** Relative label like "Last seen 3h ago" / "Last seen just now". */
export function lastSeenLabel(lastSeenAt) {
  if (!lastSeenAt) return "Never signed in";
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  if (diff < ONLINE_MS) return "Online";

  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Last seen ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `Last seen ${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Last seen ${months}mo ago`;
  return `Last seen ${Math.floor(months / 12)}y ago`;
}

/** Exact timestamp for a title/tooltip. Fixed locale to match SSR. */
export function exactSeen(lastSeenAt) {
  if (!lastSeenAt) return "Never signed in";
  return new Date(lastSeenAt).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function presence(lastSeenAt) {
  return {
    online: isOnline(lastSeenAt),
    label: lastSeenLabel(lastSeenAt),
    exact: exactSeen(lastSeenAt),
  };
}
