// Edge Function: stripe-onboard-return  (public — verify_jwt MUST be false)
//
// Stripe account links require http(s) return/refresh URLs. This page is that
// landing target: it immediately deep-links back into the Evend app so the
// in-app browser (WebBrowser.openAuthSessionAsync with "evend://...") resolves.

Deno.serve((req) => {
  const status = new URL(req.url).searchParams.get("status") ?? "done";
  const deepLink = `evend://stripe-onboarding-return?status=${encodeURIComponent(status)}`;
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Returning to Evend</title>
<script>window.location.replace(${JSON.stringify(deepLink)});</script>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;text-align:center;padding:48px;color:#111">
<p>Returning to Evend…</p>
<p><a href="${deepLink}">Tap here if you are not redirected automatically.</a></p>
</body>
</html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});
