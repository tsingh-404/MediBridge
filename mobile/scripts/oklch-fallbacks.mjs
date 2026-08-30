// Converts the oklch() literals used by the design tokens to sRGB hex, so the
// CSS two-declaration fallback pattern can serve browsers without oklch()
// (Safari < 15.4, Chrome < 111). Reference: CSS Color 4, Ottosson's oklab.
const OKLCH = /oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/g;

function oklchToHex(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;

  const lin = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  const enc = (v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, c)) * 255);
  };
  const [r, g, bl] = lin.map(enc);
  const gamutClipped = lin.some((v) => v < -0.001 || v > 1.001);
  return { hex: '#' + [r, g, bl].map((n) => n.toString(16).padStart(2, '0')).join(''), gamutClipped };
}

const input = process.argv[2] ?? '';
for (const m of input.matchAll(OKLCH)) {
  const [full, L, C, H] = m;
  const { hex, gamutClipped } = oklchToHex(Number(L) / 100, Number(C), Number(H));
  console.log(`${full.padEnd(26)} -> ${hex}${gamutClipped ? '   (out of sRGB gamut, clipped)' : ''}`);
}
