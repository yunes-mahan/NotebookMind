-- Migration 12 — profile avatar persistence
-- Adds a column to store the user's profile photo (data URL or hosted URL),
-- so display-name + photo edits made in "Edit profile" survive reloads and
-- sync across devices (wired via updateProfile / getMyProfile).
alter table public.profiles
  add column if not exists avatar_url text;
