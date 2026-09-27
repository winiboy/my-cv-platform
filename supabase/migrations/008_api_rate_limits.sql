-- ============================================================================
-- 008_api_rate_limits.sql
--
-- Cross-instance request counters for the AI route rate limiter.
--
-- Finding H3 of the Phase 30 security review: the public AI tools under
-- /api/tools and the authenticated routes under /api/ai forward caller text to
-- the project's paid Groq account with no limit on how often. The only limiter
-- in the codebase before this was an in-memory Map inside one route, which on a
-- serverless deployment counts per instance and is cleared by every cold start
-- -- a speed bump, not a limit.
--
-- A durable counter is what makes a published limit true for the deployment as
-- a whole, and PostgreSQL is already a dependency of every one of these routes,
-- so this needs no new infrastructure and no new package.
--
-- Everything here is additive and idempotent: re-applying the file against an
-- already-migrated database is a no-op. Once deployed this file is frozen; a
-- later correction gets its own forward migration.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The counter table.
--
-- One row per bucket (`ai:anon:<ip>` or `ai:user:<uuid>`), holding the start of
-- the caller's current fixed window and how many requests it has counted.
--
-- RLS is enabled and NO policy is created, and the table privileges are revoked
-- from the client roles. That combination is the point: nothing reachable with
-- the anon or authenticated key can read, insert or edit a counter -- not its
-- own and not anyone else's -- so a caller cannot inspect another caller's
-- usage or reset their own. The only way in is consume_rate_limit() below,
-- which is SECURITY DEFINER and does exactly one thing.
--
-- Enabling RLS with no policy does not lock the function out of its own table:
-- PostgreSQL exempts a table's owner from row security unless the table is
-- explicitly set to FORCE ROW LEVEL SECURITY, and the function below is owned
-- by the same role that owns this table. The empty policy set therefore blocks
-- exactly the client roles and nothing else.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  bucket text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.api_rate_limits IS
  'Fixed-window request counters for AI endpoint rate limiting. Written only by public.consume_rate_limit().';

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.api_rate_limits FROM anon, authenticated;

-- Supports the housekeeping delete in consume_rate_limit(); without it that
-- delete is a sequential scan over every address ever seen.
CREATE INDEX IF NOT EXISTS api_rate_limits_window_started_at_idx
  ON public.api_rate_limits (window_started_at);


-- ----------------------------------------------------------------------------
-- consume_rate_limit(bucket, limit, window_seconds)
--
-- Counts one request and says whether it is admitted. The increment, the window
-- roll-over and the comparison against the limit all happen inside a single
-- INSERT ... ON CONFLICT statement, so two concurrent requests cannot both read
-- the same count and both conclude they are under the limit: the second one
-- blocks on the first one's row lock and sees the incremented value.
--
-- The window start is carried forward while the window is live and reset to now
-- once it has elapsed, which is what makes this a fixed window rather than a
-- rolling penalty: a refused caller's window still ends when it was always
-- going to end, and continued hammering does not extend the block.
--
-- SECURITY DEFINER with a pinned search_path: the body must reach a table the
-- calling role has no rights on, and pinning search_path removes the caller's
-- influence over which objects the elevated body resolves to (pg_temp last, so
-- a temporary object cannot shadow a public one).
--
-- The function's authority is bounded by construction: it takes no user
-- identity, touches no user data, and can only ever increment one counter in
-- one table. The limit and window are parameters because the policy belongs to
-- the application layer that documents it; they are range-checked below so a
-- caller cannot pass an absurd limit and effectively disable the counter.
--
-- One caveat, measured rather than assumed: repeated invocations within a single
-- SQL statement (a lateral join over generate_series, say) do NOT accumulate --
-- every invocation reads the pre-statement row version and writes 1. Separate
-- statements do accumulate, including inside one transaction, which is what an
-- HTTP request performs. Anyone batching calls into one statement must not read
-- the result as a count.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window timestamptz;
  v_count integer;
BEGIN
  IF p_bucket IS NULL OR length(p_bucket) = 0 OR length(p_bucket) > 200 THEN
    RAISE EXCEPTION 'consume_rate_limit: bucket must be 1-200 characters';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100000 THEN
    RAISE EXCEPTION 'consume_rate_limit: limit must be between 1 and 100000';
  END IF;

  IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'consume_rate_limit: window must be between 1 and 86400 seconds';
  END IF;

  -- clock_timestamp() rather than now(): now() is the transaction start time,
  -- which is identical for every statement in a transaction. Nothing here
  -- batches today, but a future caller that counted twice in one transaction
  -- would silently get a frozen clock.
  INSERT INTO public.api_rate_limits AS l (bucket, window_started_at, request_count)
  VALUES (p_bucket, v_now, 1)
  ON CONFLICT (bucket) DO UPDATE
    SET window_started_at = CASE
          WHEN l.window_started_at + make_interval(secs => p_window_seconds) <= v_now
            THEN v_now
          ELSE l.window_started_at
        END,
        request_count = CASE
          WHEN l.window_started_at + make_interval(secs => p_window_seconds) <= v_now
            THEN 1
          ELSE l.request_count + 1
        END
  RETURNING l.window_started_at, l.request_count
  INTO v_window, v_count;

  -- Housekeeping. One row per distinct address accumulates indefinitely
  -- otherwise. Sampled rather than run on every call so the cost is amortised
  -- to roughly one extra delete per thousand requests; a scheduled job is the
  -- tidier answer and remains open to the owner, but this keeps the table
  -- bounded without requiring one.
  IF random() < 0.001 THEN
    DELETE FROM public.api_rate_limits
    WHERE window_started_at < v_now - interval '1 day';
  END IF;

  IF v_count > p_limit THEN
    RETURN QUERY SELECT
      false,
      GREATEST(
        1,
        ceil(extract(epoch FROM (v_window + make_interval(secs => p_window_seconds) - v_now)))::integer
      );
  ELSE
    RETURN QUERY SELECT true, 0;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.consume_rate_limit(text, integer, integer) IS
  'Counts one request against a fixed window and reports whether it is admitted. Sole writer of public.api_rate_limits.';

-- The public tools are anonymous by design, so the anon role must be able to
-- count its own requests. Both roles get EXECUTE and nothing else; neither can
-- reach the table the function writes.
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO anon, authenticated;
