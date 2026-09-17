/**
 * Same-origin-friendly proxy for the office TV arrival feed.
 * GitHub Pages calls GET /alerts with no secret.
 * This Worker injects X-Office-Display-Secret and forwards upstream.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = String(env.ALLOW_ORIGIN || "https://dan-sells.co.uk")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }), origin, allowed);
    }

    if (request.method !== "GET" || url.pathname !== "/alerts") {
      return cors(new Response("Not found", { status: 404 }), origin, allowed);
    }

    const secret = env.OFFICE_DISPLAY_SECRET;
    const upstreamUrl = env.UPSTREAM_ALERTS_URL;
    if (!secret || !upstreamUrl || upstreamUrl.includes("REPLACE")) {
      return cors(
        json({ error: "proxy not configured" }, 503),
        origin,
        allowed
      );
    }

    const since = url.searchParams.get("since");
    const target = new URL(upstreamUrl);
    if (since) target.searchParams.set("since", since);

    let upstream;
    try {
      upstream = await fetch(target.toString(), {
        method: "GET",
        headers: {
          "X-Office-Display-Secret": secret,
          Accept: "application/json",
        },
      });
    } catch (err) {
      return cors(
        json({ error: "upstream fetch failed", detail: String(err) }, 502),
        origin,
        allowed
      );
    }

    const body = await upstream.arrayBuffer();
    return cors(
      new Response(body, {
        status: upstream.status,
        headers: {
          "content-type":
            upstream.headers.get("content-type") ||
            "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      }),
      origin,
      allowed
    );
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function cors(res, origin, allowed) {
  const headers = new Headers(res.headers);
  const ok =
    origin && allowed.includes(origin)
      ? origin
      : allowed[0] || "https://dan-sells.co.uk";
  // Reflect only allowlisted origins (TV pages are on dan-sells.co.uk)
  if (origin && allowed.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  } else if (!origin) {
    // non-browser clients
    headers.set("access-control-allow-origin", ok);
  } else {
    headers.set("access-control-allow-origin", allowed[0] || ok);
    headers.set("vary", "Origin");
  }
  headers.set("access-control-allow-methods", "GET, OPTIONS");
  headers.set("access-control-allow-headers", "Content-Type");
  headers.set("cache-control", "no-store");
  return new Response(res.body, { status: res.status, headers });
}
