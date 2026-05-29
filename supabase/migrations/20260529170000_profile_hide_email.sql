-- Migration to add hide_email column to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hide_email boolean NOT NULL DEFAULT false;
