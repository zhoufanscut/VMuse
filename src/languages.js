import { fetchJson, fetchText } from './util.js';

const sampleCache = new Map();

function isLanguageManifest(m) {
  return !!m && typeof m === 'object'
    && typeof m.id === 'string' && m.id
    && typeof m.label === 'string' && m.label
    && typeof m.shikiLang === 'string' && m.shikiLang
    && typeof m.sample === 'string' && m.sample;
}

// Manifests are fetched in parallel. A missing/malformed one is dropped with a
// console.error — it must never take the whole app down.
export async function loadLanguageManifests(ids) {
  const settled = await Promise.allSettled(
    ids.map(id => fetchJson(`./data/languages/${id}.json`)),
  );
  const results = [];
  settled.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(r.reason);
    } else if (!isLanguageManifest(r.value)) {
      console.error(`vmuse: ignoring malformed manifest data/languages/${ids[i]}.json`);
    } else {
      results.push(r.value);
    }
  });
  return results;
}

// Manifest's sample field stores "data/samples/python.txt" (no ./ prefix).
// Prepend './' so the fetch works on GH Pages project sites.
// Cache by manifest.id — don't re-fetch on tab re-activation. A failed fetch
// throws (nothing is cached) so the preview can say what went wrong instead
// of silently rendering an empty block.
export async function loadSample(manifest) {
  if (sampleCache.has(manifest.id)) {
    return sampleCache.get(manifest.id);
  }
  const text = await fetchText('./' + manifest.sample);
  sampleCache.set(manifest.id, text);
  return text;
}
