/**
 * Cloudflare Worker - vehicleproxy
 * Deploy at: https://vehicleproxy.danielcane1992.workers.dev
 *
 * Required environment variables (Cloudflare dashboard → Worker → Settings → Variables):
 *   DVLA_API_KEY      - DVLA VES API key (same name as before - do NOT rename)
 *   APIFY_TOKEN       - Apify API token (apify.com → Settings → Integrations)
 *   MOT_CLIENT_ID     - DVSA MOT History API client id
 *   MOT_CLIENT_SECRET - DVSA MOT History API client secret
 *   MOT_API_KEY       - DVSA MOT History API key
 *
 * Actor ID: Ca7tBqNduWgy2A2pq (AutoTrader scraper)
 *
 * Abuse protection (added Oct 2026):
 *   - Only browsers on the allowed origins below get an answer. Anything else
 *     (other websites, scripts with no Origin/Referer) gets 403. A script can
 *     fake these headers, so the rate limits below are the real backstop.
 *   - Per-IP rate limits via Cloudflare's Rate Limiting binding (configured in
 *     wrangler.vehicleproxy.toml). If the binding is missing the worker falls
 *     back to a best-effort in-memory limit, so it never fails open completely.
 *   - runId and reg are validated before they go anywhere near an upstream URL.
 *
 * Deploy (from the repo root):  npx wrangler deploy -c wrangler.vehicleproxy.toml
 */

const APIFY_ACTOR = 'Ca7tBqNduWgy2A2pq';

/* Sites allowed to call this worker from a browser. */
const ALLOWED_ORIGINS = [
  'https://dan-sells.co.uk',
  'https://www.dan-sells.co.uk',
  'https://danbmw.github.io',
];
/* Local testing on Dan's own machine (http://localhost:<any port>). */
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

function allowedOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin) return (ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin)) ? origin : null;
  /* No Origin header: accept only a Referer from an allowed site. */
  const referer = request.headers.get('Referer') || '';
  try {
    const o = new URL(referer).origin;
    if (ALLOWED_ORIGINS.includes(o) || LOCAL_ORIGIN.test(o)) return o;
  } catch (_) {}
  return null;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
    'Vary':                         'Origin',
  };
}

/* Per-IP limits per 60 seconds. A customer typing a reg twice or a trade
   value page polling every 3s for 45s stays well inside these; a script
   hammering the paid lookups does not. Showroom wifi shares one IP, so the
   numbers are deliberately generous. Keep in step with
   wrangler.vehicleproxy.toml. */
const LIMITS = {
  lookup: { binding: 'LOOKUP_LIMITER', limit: 30 },   /* dvla-lookup, vehicle-lookup */
  start:  { binding: 'MARKET_START_LIMITER', limit: 4 }, /* market-start = paid Apify run */
  poll:   { binding: 'POLL_LIMITER', limit: 60 },     /* market-poll */
};
const TARGET_BUCKET = {
  'dvla-lookup': 'lookup', 'vehicle-lookup': 'lookup',
  'market-start': 'start', 'market-poll': 'poll',
};

/* Fallback used only if the Rate Limiting binding is not configured:
   per-isolate memory, so it is best effort, but never "no limit at all". */
const memHits = new Map();
function memLimit(key, limit) {
  const now = Date.now(), win = 60000;
  let e = memHits.get(key);
  if (!e || now - e.t > win) { e = { t: now, n: 0 }; memHits.set(key, e); }
  e.n++;
  if (memHits.size > 5000) memHits.clear();
  return e.n <= limit;
}

async function withinLimit(env, bucket, ip) {
  const cfg = LIMITS[bucket];
  const key = bucket + ':' + ip;
  const rl = env && env[cfg.binding];
  if (rl && typeof rl.limit === 'function') {
    try { const { success } = await rl.limit({ key }); return success; }
    catch (_) { /* binding hiccup: fall through to the memory limit */ }
  }
  return memLimit(key, cfg.limit);
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { ...(origin ? corsHeaders(origin) : { 'Vary': 'Origin' }), 'Content-Type': 'application/json' }
  });
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request);
    if (!origin) return json({ error: 'Forbidden' }, 403, null);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, origin);

    const url    = new URL(request.url);
    const target = url.searchParams.get('target');
    const bucket = TARGET_BUCKET[target];
    if (!bucket) return json({ error: 'Unknown target' }, 200, origin);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!(await withinLimit(env, bucket, ip))) {
      return json({ error: 'Too many requests, please try again in a minute' }, 429, origin);
    }

    try {
      let body;
      if      (target === 'dvla-lookup')    body = await dvlaLookup(url.searchParams.get('reg') || '', env);
      else if (target === 'vehicle-lookup') body = await vehicleLookup(url.searchParams.get('reg') || '', env);
      else if (target === 'market-start')   body = await marketStart(url.searchParams, env);
      else if (target === 'market-poll')    body = await marketPoll(url.searchParams.get('runId') || '', env);

      return json(body, 200, origin);
    } catch (e) {
      return json({ error: e.message }, 500, origin);
    }
  }
};

/* UK regs are at most 7 characters plus spaces; anything else never reaches DVLA/DVSA. */
function cleanReg(reg) {
  const r = String(reg || '').replace(/\s/g, '').toUpperCase();
  return /^[A-Z0-9]{1,8}$/.test(r) ? r : '';
}

/* ── DVLA lookup ────────────────────────────────────────────────── */
async function dvlaLookup(reg, env) {
  if (!reg) return { error: 'No reg provided' };
  if (!cleanReg(reg)) return { error: 'Invalid reg' };

  const res = await fetch('https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles', {
    method:  'POST',
    headers: { 'x-api-key': env.DVLA_API_KEY, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ registrationNumber: reg.replace(/\s/g, '').toUpperCase() })
  });

  if (!res.ok) return { error: 'DVLA error: ' + res.status };

  const d = await res.json();
  return {
    make:              d.make              || '',
    model:             d.model             || '',
    yearOfManufacture: d.yearOfManufacture || null,
    year:              d.yearOfManufacture || null,
    colour:            d.colour            || '',
    fuelType:          d.fuelType          || '',
    co2Emissions:      d.co2Emissions      || null,
    engineCapacity:    d.engineCapacity    || null,
    taxStatus:         d.taxStatus         || '',
    motStatus:         d.motStatus         || '',
    motExpiryDate:     d.motExpiryDate     || '',
    taxDueDate:        d.taxDueDate        || ''
  };
}

/* ── DVSA MOT History API ───────────────────────────────────────── */
const MOT_TOKEN_URL = 'https://login.microsoftonline.com/a455b827-244f-4c97-b5b4-ce5d13b4d00c/oauth2/v2.0/token';
const MOT_SCOPE = 'https://tapi.dvsa.gov.uk/.default';
let motToken = { value: null, exp: 0 };

async function getMotToken(env) {
  if (motToken.value && Date.now() < motToken.exp - 60000) return motToken.value;
  const res = await fetch(MOT_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     env.MOT_CLIENT_ID,
      client_secret: env.MOT_CLIENT_SECRET,
      scope:         MOT_SCOPE,
    }),
  });
  if (!res.ok) return null;
  const d = await res.json();
  motToken = { value: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return motToken.value;
}

async function motLookup(reg, env) {
  if (!env.MOT_CLIENT_ID || !env.MOT_CLIENT_SECRET || !env.MOT_API_KEY) return null;
  const token = await getMotToken(env);
  if (!token) return null;
  const res = await fetch(
    'https://history.mot.api.gov.uk/v1/trade/vehicles/registration/' +
      encodeURIComponent(reg.replace(/\s/g, '').toUpperCase()),
    { headers: { Authorization: 'Bearer ' + token, 'X-API-Key': env.MOT_API_KEY } }
  );
  if (!res.ok) return null;
  return res.json();
}

/* ── Combined lookup: DVLA (tax/MOT dates) + MOT History (model, tests) ── */
async function vehicleLookup(reg, env) {
  if (!reg) return { error: 'No reg provided' };
  if (!cleanReg(reg)) return { error: 'Invalid reg' };
  const [dvla, mot] = await Promise.all([
    dvlaLookup(reg, env).catch(() => ({})),
    motLookup(reg, env).catch(() => null),
  ]);
  const out = (dvla && !dvla.error) ? { ...dvla } : {};
  if (mot) {
    if (mot.model) out.model = mot.model;
    if (!out.make && mot.make) out.make = mot.make;
    if (!out.colour && mot.primaryColour) out.colour = mot.primaryColour;
    if (!out.fuelType && mot.fuelType) out.fuelType = mot.fuelType;
    if (!out.yearOfManufacture && mot.manufactureDate) {
      out.yearOfManufacture = parseInt(mot.manufactureDate.slice(0, 4), 10) || null;
      out.year = out.yearOfManufacture;
    }
    // New vehicles that haven't had a first MOT yet
    if (mot.motTestDueDate) out.motDueDate = mot.motTestDueDate;
    const tests = Array.isArray(mot.motTests) ? mot.motTests : [];
    out.motHistory = tests.slice(0, 5).map(t => {
      const defects = Array.isArray(t.defects) ? t.defects : [];
      return {
        date:       (t.completedDate || '').slice(0, 10),
        result:     t.testResult || '',
        mileage:    t.odometerValue ? Number(t.odometerValue).toLocaleString('en-GB') + ' ' + (t.odometerUnit || 'MI').toLowerCase() : '',
        odo:        t.odometerValue ? Number(t.odometerValue) : null,
        odoUnit:    (t.odometerUnit || 'MI').toUpperCase(),
        expiry:     t.expiryDate || '',
        advisories: defects.filter(d => (d.type || '').toUpperCase() === 'ADVISORY').length,
        failures:   defects.filter(d => ['MAJOR', 'DANGEROUS', 'FAIL', 'PRS'].includes((d.type || '').toUpperCase())).length,
      };
    });
    // Best MOT expiry: DVLA's live date, else latest passed test's expiry
    if (!out.motExpiryDate) {
      const passed = tests.find(t => (t.testResult || '').toUpperCase() === 'PASSED' && t.expiryDate);
      if (passed) out.motExpiryDate = passed.expiryDate;
    }
  }
  if (!out.make && !out.model) return { error: 'Vehicle not found' };
  return out;
}

/* ── Market start ───────────────────────────────────────────────── */
async function marketStart(params, env) {
  const make    = (params.get('make')    || '').toUpperCase();
  const model   = (params.get('model')   || '').toUpperCase().replace(/\s+/g, '-');
  const year    = params.get('year')    || '';
  const mileage = params.get('mileage') || '';
  const fuel    = (params.get('fuel')   || '').toLowerCase();

  if (!make || !year) return { error: 'make and year are required' };

  // Build AutoTrader search URL
  const atParams = new URLSearchParams();
  atParams.set('make',       make);
  if (model) atParams.set('model', model);

  const yr = parseInt(year, 10);
  if (yr) {
    atParams.set('year-from', String(yr - 1));
    atParams.set('year-to',   String(yr + 1));
  }
  // Nationwide search centred on Hedin Ruxley
  atParams.set('postcode', 'SS2 5AZ');
  atParams.set('radius',   '1500');
  atParams.set('sort',     'relevance');

  // Map DVLA fuelType → AutoTrader fuel-type query value
  const fuelMap = {
    petrol:            'petrol',
    diesel:            'diesel',
    electricity:       'electric',
    electric:          'electric',
    hybrid:            'hybrid-electric',
    'mild hybrid':     'mild-hybrid',
    'plug-in hybrid':  'plug-in-hybrid-electric',
  };
  const atFuel = fuelMap[fuel];
  if (atFuel) atParams.set('fuel-type', atFuel);

  const searchUrl = `https://www.autotrader.co.uk/car-search?${atParams.toString()}`;

  // Start Apify actor run
  const res = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${env.APIFY_TOKEN}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      startUrls:            [{ url: searchUrl }],
      includeListingDetails: true,
      maxItems:              50,
      maxConcurrency:        5,
      proxy: {
        useApifyProxy:    true,
        apifyProxyGroups: ['RESIDENTIAL']
      }
    })
  });

  if (!res.ok) {
    const txt = await res.text();
    return { error: 'Failed to start Apify run: ' + res.status + ' ' + txt };
  }

  const data = await res.json();
  const runId = data.data && data.data.id ? data.data.id : null;
  if (!runId) return { error: 'No runId in Apify response' };

  return { runId };
}

/* ── Market poll ────────────────────────────────────────────────── */
async function marketPoll(runId, env) {
  if (!runId) return { status: 'error', error: 'No runId provided' };
  /* Apify run ids are short alphanumerics. Refuse anything else so a crafted
     runId can't steer the token-bearing request to another Apify endpoint. */
  if (!/^[A-Za-z0-9]{6,40}$/.test(runId)) return { status: 'error', error: 'Invalid runId' };

  const runRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${env.APIFY_TOKEN}`);
  if (!runRes.ok) return { status: 'error', error: 'Failed to poll: ' + runRes.status };

  const runData = await runRes.json();
  const status  = (runData.data && runData.data.status) ? runData.data.status : 'UNKNOWN';

  if (status === 'SUCCEEDED') {
    const datasetId = runData.data.defaultDatasetId;
    const itemsRes  = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${env.APIFY_TOKEN}&limit=50`);
    const items     = await itemsRes.json();
    return { status: 'SUCCEEDED', items: Array.isArray(items) ? items : [] };
  }

  if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
    return { status: 'FAILED', error: 'Apify run ended with status: ' + status };
  }

  return { status: 'RUNNING' };
}
