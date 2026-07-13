type RoutePreviewProvider = 'auto' | 'mapillary' | 'google';

const allowedOrigins = new Set([
  'https://trailpress.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

function normalizeProvider(value: string | undefined): RoutePreviewProvider {
  if (value === 'google' || value === 'mapillary' || value === 'auto') return value;
  return 'auto';
}

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && allowedOrigins.has(origin) ? origin : 'https://trailpress.github.io';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=300, s-maxage=300',
    'Vary': 'Origin',
  };
}

function json(body: unknown, origin: string | null, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

Deno.serve((request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method !== 'GET') {
    return json({ status: 'method-not-allowed' }, origin, 405);
  }

  if (origin && !allowedOrigins.has(origin)) {
    return json({ status: 'forbidden-origin' }, origin, 403);
  }

  return json(
    {
      status: 'ok',
      googleMapsApiKey: Deno.env.get('GOOGLE_MAPS_API_KEY') ?? undefined,
      mapillaryAccessToken: Deno.env.get('MAPILLARY_ACCESS_TOKEN') ?? undefined,
      provider: normalizeProvider(Deno.env.get('ROUTE_PREVIEW_PROVIDER')),
    },
    origin,
  );
});
