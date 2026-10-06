'use strict';
// Public read-only lookup. Never imports the legacy server, database, or account API.
const allowed = new Set(['year', 'make', 'model', 'engine_size', 'test_group', 'page']);
module.exports = async function fitment(route, req, res, fetchUpstream = fetch) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, {error: 'Use GET for vehicle lookup.'}); }
  if (!['filters', 'search'].includes(route)) return send(404, {error: 'Lookup not found.'});
  const params = new URL(req.url, 'https://localhost').searchParams;
  const seen = new Set();
  for (const [key, value] of params) {
    if (!allowed.has(key) || seen.has(key) || value.length > 120 || /[\x00-\x1f\x7f]/.test(value) ||
      (key === 'page' && !/^[1-9]\d{0,5}$/.test(value))) return send(400, {error: 'Invalid vehicle lookup.'});
    seen.add(key);
  }
  try {
    const url = 'https://cucarbcats.com/api/converters/' + (route === 'filters' ? 'filters/' : '') + '?' + params;
    const upstream = await fetchUpstream(url, {
      headers: {Accept: 'application/json'}, redirect: 'error', signal: AbortSignal.timeout(20000)
    });
    if (!upstream.ok) throw Error('Lookup failed');
    const payload = await upstream.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error('Invalid response');
    // Short shared cache reduces repeated source calls; browsers still refresh their requests.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    return send(200, payload);
  } catch {
    return send(502, {error: 'Vehicle lookup is unavailable. Please try again.'});
  }
};
