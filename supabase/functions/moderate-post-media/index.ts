// Image safety check for social feed posts.
//
// Called by the client AFTER images are uploaded to the public `post-media`
// bucket but BEFORE the post is created. Uses OpenAI's free `omni-moderation`
// endpoint to flag explicit imagery (sexual content, sexual/minors, graphic
// violence/gore). If flagged, the client deletes the uploaded images and aborts.
//
// Fail-open: if the moderation service is unconfigured or errors, we allow the
// post (returning `degraded: true`) so a provider outage can't block legitimate
// users. Confidently-flagged content is always blocked.
//
// Required secret: OPENAI_API_KEY

import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

// Explicit-only: block clearly unsafe imagery, allow the rest.
const BLOCK_CATEGORIES = ["sexual", "sexual/minors", "violence/graphic"];
const MAX_IMAGES = 4;

async function moderateImage(url: string): Promise<{ blocked: boolean; degraded: boolean }> {
  try {
    const resp = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input: [{ type: "image_url", image_url: { url } }],
      }),
    });

    if (!resp.ok) {
      console.warn("moderate-post-media: OpenAI non-200", resp.status, await resp.text());
      return { blocked: false, degraded: true };
    }

    const data = await resp.json();
    const result = data?.results?.[0];
    if (!result) return { blocked: false, degraded: true };

    const categories = result.categories ?? {};
    const blocked = BLOCK_CATEGORIES.some((c) => categories[c] === true);
    return { blocked, degraded: false };
  } catch (e) {
    console.warn("moderate-post-media: fetch error", String(e));
    return { blocked: false, degraded: true };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Require an authenticated user (verify_jwt is also enabled at the platform level).
  const authed = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const {
    data: { user },
    error: uErr,
  } = await authed.auth.getUser();
  if (uErr || !user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const urls: string[] = Array.isArray(body?.image_urls)
    ? body.image_urls.filter((u: unknown): u is string => typeof u === "string" && !!u)
    : [];

  if (urls.length === 0) return json({ allowed: true });
  if (urls.length > MAX_IMAGES) return json({ allowed: false, reason: "too_many" });

  // If the moderation provider isn't configured, fail open (don't brick posting).
  if (!OPENAI_API_KEY) {
    console.warn("moderate-post-media: OPENAI_API_KEY not set — allowing (degraded)");
    return json({ allowed: true, degraded: true });
  }

  const results = await Promise.all(urls.map((u) => moderateImage(u)));
  const blocked = results.some((r) => r.blocked);
  const degraded = results.some((r) => r.degraded);

  if (blocked) return json({ allowed: false, reason: "image" });
  return json({ allowed: true, degraded });
});
