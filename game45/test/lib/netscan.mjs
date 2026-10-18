// H-NET (static scan of play.html), UB01 output scan, H-SIZE verdicts. Pure functions on strings and numbers.

export const SIZE_GATE = 5_000_000;      // Manager placeholder, 45.15 acceptance 4: fail above
export const SIZE_TARGET = 250_000;      // Engine Builder design figure: WARN above, never fails

export function sizeVerdict(bytes) {
  return { bytes, fail: bytes > SIZE_GATE, warn: bytes > SIZE_TARGET, line: `size ${bytes} B, gate ${SIZE_GATE} B, target ${SIZE_TARGET} B${bytes > SIZE_GATE ? ' FAIL' : bytes > SIZE_TARGET ? ' WARN' : ' ok'}` };
}

// the ten patterns of H-NET (plan table). Each has a test fixture that must be caught.
const CDN = /(?:cdn\.|cdnjs|unpkg\.com|jsdelivr|googleapis\.com|gstatic\.com|cloudflare\.com|bootstrapcdn|jquery\.com)/i;
export const NET_PATTERNS = [
  { id: 'url', re: /https?:\/\/(?!www\.w3\.org\/)[^\s"'<>)]+/i, sample: '<script>var u = "https://example.invalid/a";</script>' },
  { id: 'script-src', re: /<script\b[^>]*\ssrc\s*=/i, sample: '<script src="play.js"></script>' },
  { id: 'link-href', re: /<link\b[^>]*\shref\s*=/i, sample: '<link rel="stylesheet" href="a.css">' },
  { id: '@import', re: /@import\b/i, sample: '<style>@import "a.css";</style>' },
  { id: 'fetch(', re: /\bfetch\s*\(/, sample: '<script>fetch("x");</script>' },
  { id: 'XMLHttpRequest', re: /\bXMLHttpRequest\b/, sample: '<script>new XMLHttpRequest();</script>' },
  { id: 'import(', re: /\bimport\s*\(/, sample: '<script>import("./a.js");</script>' },
  { id: 'WebSocket', re: /\bWebSocket\b/, sample: '<script>new WebSocket("ws://x");</script>' },
  { id: 'sendBeacon', re: /\bsendBeacon\b/, sample: '<script>navigator.sendBeacon("x");</script>' },
  { id: 'cdn-host', re: CDN, sample: '<script>var h = "cdn.example";</script>' },
  { id: 'file-url', re: /file:\/\//i, sample: '<img src="file:///C:/x.png">' },      // added by 45.10: a file:// sub-resource is not routable in Playwright
];

// returns [{id, line, text}]; the SVG namespace http://www.w3.org/ is the only http(s) string allowed
export function netHits(html) {
  const hits = [];
  const lines = html.split('\n');
  for (const p of NET_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const m = p.re.exec(lines[i]);
      if (m) hits.push({ id: p.id, line: i + 1, text: lines[i].trim().slice(0, 100) });
    }
  }
  return hits;
}

// UB01 / build output scan: no module script, no src= on a script tag, no import or export keyword at a line start
export function moduleHits(html) {
  const hits = [];
  if (/type\s*=\s*["']module["']/i.test(html)) hits.push('type="module"');
  if (/<script\b[^>]*\ssrc\s*=/i.test(html)) hits.push('script src=');
  if (/^\s*(import|export)\s/m.test(html)) hits.push('import/export keyword');
  return hits;
}
