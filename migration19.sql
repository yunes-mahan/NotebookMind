-- ============================================================
-- NotebookMind — Migration 19: self-service account deletion
-- Run AFTER migrations 1-18. Idempotent.
--
-- A SECURITY DEFINER RPC that lets a signed-in user permanently delete their OWN
-- account. It clears rows that might not cascade (friend shares, owned courses,
-- enrollments) and then removes the auth.users row, which cascades everything
-- else keyed on the user (profile, documents, notes, flashcards, comments,
-- challenges, submissions, point events…). Only ever acts on the caller (auth.uid()).
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  -- Sharing links (both directions) and anything the user owns/joined that may
  -- not be wired to cascade from auth.users.
  DELETE FROM public.friend_shares WHERE owner_id = uid OR friend_id = uid;
  DELETE FROM public.courses WHERE teacher_id = uid;          -- cascades weeks/notebooks/enrollments
  DELETE FROM public.course_enrollments WHERE user_id = uid;
  -- Finally the identity itself — cascades the remaining user-keyed rows.
  DELETE FROM auth.users WHERE id = uid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
