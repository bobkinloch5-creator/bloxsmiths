-- Database migration for Bloxsmith badges, community chat, followers, friends, and blocking system

-- 1. Update profiles table to support badges and mutes
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS badges text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS muted_until timestamptz;

-- 2. Create helper to check if a user is staff or admin/owner
CREATE OR REPLACE FUNCTION public.is_staff_or_admin(_user_id uuid)
RETURNS boolean SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _is_admin boolean;
  _badges text[];
BEGIN
  -- check existing roles
  _is_admin := public.is_admin(_user_id);
  IF _is_admin THEN
    RETURN true;
  END IF;

  -- check badges
  SELECT badges INTO _badges FROM public.profiles WHERE id = _user_id;
  IF _badges && ARRAY['owner', 'staff', 'admin'] THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- 3. Create community_messages table
CREATE TABLE IF NOT EXISTS public.community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_reported boolean NOT NULL DEFAULT false,
  report_reason text,
  reported_by uuid[] NOT NULL DEFAULT '{}'
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_community_messages_created ON public.community_messages(created_at DESC);

-- Enable RLS on community_messages
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read community messages"
  ON public.community_messages FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own community messages if not muted or banned"
  ON public.community_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id 
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND (banned = true OR (muted_until IS NOT NULL AND muted_until > now()))
    )
  );

CREATE POLICY "Admins or staff can update reported status"
  ON public.community_messages FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (public.is_staff_or_admin(auth.uid()) OR auth.uid() = user_id);

CREATE POLICY "Users and staff can delete community messages"
  ON public.community_messages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_staff_or_admin(auth.uid()));


-- 4. Create user_follows table (followers)
CREATE TABLE IF NOT EXISTS public.user_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

-- Enable RLS on user_follows
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read follows"
  ON public.user_follows FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can follow"
  ON public.user_follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Authenticated users can unfollow"
  ON public.user_follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);


-- 5. Create friend_requests table
CREATE TABLE IF NOT EXISTS public.friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sender_id, receiver_id)
);

-- Enable RLS on friend_requests
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own friend requests"
  ON public.friend_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Authenticated users can send friend requests"
  ON public.friend_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Receiver can update request status"
  ON public.friend_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

CREATE POLICY "Users can delete own friend requests"
  ON public.friend_requests FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);


-- 6. Create blocked_users table
CREATE TABLE IF NOT EXISTS public.blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

-- Enable RLS on blocked_users
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own blocked list"
  ON public.blocked_users FOR SELECT
  TO authenticated
  USING (auth.uid() = blocker_id);

CREATE POLICY "Users can block other users"
  ON public.blocked_users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can unblock other users"
  ON public.blocked_users FOR DELETE
  TO authenticated
  USING (auth.uid() = blocker_id);


-- 7. Add tables to Supabase Realtime publication
ALTER TABLE public.community_messages REPLICA IDENTITY FULL;
ALTER TABLE public.friend_requests REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'community_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'friend_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
