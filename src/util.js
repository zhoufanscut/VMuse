// vmuse/util — shared fetch helpers that fail loudly on HTTP errors.
// Without the res.ok check, a 404 returning an HTML body makes r.json() throw a
// generic SyntaxError that masquerades as "invalid JSON".

export async function fetchJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

export async function fetchText(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}
