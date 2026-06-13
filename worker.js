/**
 * Cloudflare Worker — vehicleproxy
 * Deploy at: https://vehicleproxy.danielcane1992.workers.dev
 *
 * Required environment variables (Cloudflare dashboard → Worker → Settings → Variables):
 *   DVLA_API_KEY — DVLA VES API key (same name as before — do NOT rename)
 *   APIFY_TOKEN  — Apify API token (apify.com → Settings → Integrations → Personal API tokens)
 *
 * Actor ID: Ca7tBqNduWgy2A2pq (AutoTrader scraper)
 */

const APIFY_ACTOR = 'Ca7tBqNduWgy2A2pq';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url    = new URL(request.url);
    const target = url.searchParams.get('target');

    try {
      let body;
      if      (target === 'dvla-lookup')  body = await dvlaLookup(url.searchParams.get('reg') || '', env);
      else if (target === 'market-start') body = await marketStart(url.searchParams, env);
      else if (target === 'market-poll')  body = await marketPoll(url.searchParams.get('runId') || '', env);
      else                                body = { error: 'Unknown target' };

      return new Response(JSON.stringify(body), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }
  }
};

/* ── DVLA lookup ────────────────────────────────────────────────── */
async function dvlaLookup(reg, env) {
  if (!reg) return { error: 'No reg provided' };

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
    motExpiryDate:     d.motExpiryDate     || '',
    taxDueDate:        d.taxDueDate        || ''
  };
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
