-- Hardening: pay_auction_win is a SECURITY DEFINER RPC called by the winning
-- buyer (authenticated). The anon role can never satisfy its auth.uid() winner
-- check, so there is no reason to expose it on the public REST surface.
-- Flagged by the security advisor (anon_security_definer_function_executable).

REVOKE EXECUTE ON FUNCTION public.pay_auction_win(uuid, numeric) FROM anon;
