// Hash routing: #/FN/ARG1/ARG2  (e.g. #/DES/RELIANCE.NS)

export function go(fn, ...args) {
  const h = "#/" + [fn, ...args].filter(x => x != null && x !== "").map(encodeURIComponent).join("/");
  if (location.hash === h) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = h;
}

export function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return { fn: (parts[0] || "TOP").toUpperCase(), args: parts.slice(1) };
}
