function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pick<T>(items: T[], seed: number, offset = 0) {
  return items[(seed + offset) % items.length];
}

export function createRobloxStyleAvatar(seedValue?: string | null) {
  const seed = hashString(seedValue || "bloxsmith-builder");
  const skin = pick(["#ffd7a8", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffe0bd"], seed, 1);
  const hair = pick(["#171717", "#3b2414", "#f6c453", "#9b5cff", "#00d9ff", "#ff4da6"], seed, 2);
  const shirt = pick(["#00d9ff", "#7c3cff", "#22c55e", "#f97316", "#ef4444", "#38bdf8"], seed, 3);
  const bg1 = pick(["#06111f", "#100820", "#071a16", "#160a1c", "#08111f"], seed, 4);
  const bg2 = pick(["#00d9ff", "#7c3cff", "#ff4da6", "#22c55e", "#f59e0b"], seed, 5);
  const accessory = seed % 3;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg1}"/>
      <stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  <circle cx="103" cy="22" r="23" fill="white" opacity=".08"/>
  <circle cx="22" cy="108" r="30" fill="white" opacity=".07"/>
  <path d="M27 112c4-25 19-37 37-37s33 12 37 37" fill="${shirt}" filter="url(#glow)"/>
  <rect x="41" y="38" width="46" height="48" rx="10" fill="${skin}"/>
  <path d="M39 47c3-18 17-27 33-22 10 3 18 12 17 27-13-7-31-7-50-5z" fill="${hair}"/>
  <rect x="38" y="55" width="8" height="17" rx="4" fill="${skin}"/>
  <rect x="82" y="55" width="8" height="17" rx="4" fill="${skin}"/>
  <rect x="52" y="58" width="8" height="8" rx="2" fill="#101828"/>
  <rect x="68" y="58" width="8" height="8" rx="2" fill="#101828"/>
  <path d="M56 74c5 4 11 4 16 0" stroke="#101828" stroke-width="4" stroke-linecap="round" fill="none"/>
  ${accessory === 0 ? '<rect x="45" y="51" width="38" height="6" rx="3" fill="#111827" opacity=".9"/><rect x="49" y="49" width="13" height="10" rx="3" fill="#00d9ff" opacity=".85"/><rect x="66" y="49" width="13" height="10" rx="3" fill="#00d9ff" opacity=".85"/>' : ""}
  ${accessory === 1 ? '<path d="M42 36h45l-4-11H47z" fill="#111827"/><rect x="50" y="20" width="29" height="8" rx="4" fill="#111827"/>' : ""}
  ${accessory === 2 ? '<circle cx="92" cy="42" r="9" fill="#f59e0b"/><path d="M87 42h10M92 37v10" stroke="#111827" stroke-width="3" stroke-linecap="round"/>' : ""}
  <path d="M31 112h66" stroke="white" stroke-width="3" opacity=".22" stroke-linecap="round"/>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
