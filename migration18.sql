-- ============================================================
-- NotebookMind — Migration 18: real friends / stat-sharing backend
-- Run AFTER migrations 1-17. Idempotent.
--
-- Replaces the session-only mock in friendsData.ts. Model is pairwise and
-- consent-based: a row (owner_id -> friend_id) means "owner shares their stats
-- with friend". Seeing each other's stats requires BOTH rows (mutual sharing) —
-- exactly the me/them flags the Friends screen already draws.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.friend_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, friend_id),
  CHECK (owner_id <> friend_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_shares_owner ON public.friend_shares(owner_id);
CREATE INDEX IF NOT EXISTS idx_friend_shares_friend ON public.friend_shares(friend_id);

ALTER TABLE public.friend_shares ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.friend_shares TO authenticated;

-- Read: rows where you're either side (so you also see who shares with you).
DROP POLICY IF EXISTS "View own friend shares" ON public.friend_shares;
CREATE POLICY "View own friend shares" ON public.friend_shares
  FOR SELECT USING (auth.uid() = owner_id OR auth.uid() = friend_id);

-- Insert: you may only create your own outgoing share.
DROP POLICY IF EXISTS "Insert own friend share" ON public.friend_shares;
CREATE POLICY "Insert own friend share" ON public.friend_shares
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Delete: you may only take back your own outgoing share.
DROP POLICY IF EXISTS "Delete own friend share" ON public.friend_shares;
CREATE POLICY "Delete own friend share" ON public.friend_shares
  FOR DELETE USING (auth.uid() = owner_id);

-- ── Send a friend request (share your stats) by email ─────────
-- Resolves the email to a user (auth.users is not directly readable by clients,
-- hence SECURITY DEFINER), inserts the outgoing (me -> them) share, and returns
-- the friend's profile. Returns no rows if the email is unknown or is yourself.
CREATE OR REPLACE FUNCTION public.request_friend(p_email text)
RETURNS TABLE (friend_id uuid, display_name text, avatar_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
-- OUT columns (friend_id, display_name, avatar_url) share names with table
-- columns used below; resolve bare identifiers to the columns, not the OUT vars.
#variable_conflict use_column
DECLARE v_id uuid;
BEGIN
  SELECT u.id INTO v_id FROM auth.users u
    WHERE lower(u.email) = lower(trim(p_email)) LIMIT 1;
  IF v_id IS NULL OR v_id = auth.uid() THEN
    RETURN;
  END IF;
  INSERT INTO public.friend_shares (owner_id, friend_id)
    VALUES (auth.uid(), v_id)
    ON CONFLICT (owner_id, friend_id) DO NOTHING;
  RETURN QUERY
    SELECT p.user_id, coalesce(p.display_name, 'Student'), p.avatar_url
    FROM public.profiles p WHERE p.user_id = v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.request_friend(text) TO authenticated;

-- ── List my friends with consent flags + gated stats ──────────
-- Everyone I have any share relationship with, in either direction. i_share /
-- they_share drive the row's state (waiting / incoming / mutual). Stats (points,
-- notebooks, first-try %) are only revealed when the sharing is MUTUAL.
CREATE OR REPLACE FUNCTION public.get_my_friends()
RETURNS TABLE (
  friend_id uuid,
  display_name text,
  avatar_url text,
  i_share boolean,
  they_share boolean,
  points integer,
  notebooks_completed bigint,
  first_try_pct integer
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  WITH rel AS (
    SELECT DISTINCT fid FROM (
      SELECT friend_id AS fid FROM friend_shares WHERE owner_id = auth.uid()
      UNION
      SELECT owner_id  AS fid FROM friend_shares WHERE friend_id = auth.uid()
    ) x
  ),
  flags AS (
    SELECT r.fid,
      EXISTS (SELECT 1 FROM friend_shares s WHERE s.owner_id = auth.uid() AND s.friend_id = r.fid) AS i_share,
      EXISTS (SELECT 1 FROM friend_shares s WHERE s.owner_id = r.fid AND s.friend_id = auth.uid()) AS they_share
    FROM rel r
  ),
  stats AS (
    SELECT s.user_id,
      count(DISTINCT s.notebook_key) AS nb,
      coalesce(sum(s.cells_attempted), 0) AS att,
      coalesce(sum(s.cells_first_try), 0) AS ft
    FROM notebook_submissions s
    GROUP BY s.user_id
  )
  SELECT
    f.fid,
    coalesce(p.display_name, 'Student'),
    p.avatar_url,
    f.i_share,
    f.they_share,
    CASE WHEN f.i_share AND f.they_share THEN coalesce(p.points, 0) ELSE 0 END,
    CASE WHEN f.i_share AND f.they_share THEN coalesce(st.nb, 0) ELSE 0 END,
    CASE WHEN f.i_share AND f.they_share AND coalesce(st.att, 0) > 0
         THEN round(100.0 * st.ft / st.att)::int ELSE 0 END
  FROM flags f
  JOIN profiles p ON p.user_id = f.fid
  LEFT JOIN stats st ON st.user_id = f.fid;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_friends() TO authenticated;
