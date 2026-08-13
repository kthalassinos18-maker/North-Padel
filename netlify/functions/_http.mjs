export const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const allowed = new Set(
    (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  return origin === new URL(request.url).origin || allowed.has(origin);
}
