-- Database migration for Bloxsmith Private Messaging

CREATE TABLE IF NOT EXISTS public.private_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_read boolean NOT NULL DEFAULT false
);

-- Optimize search for threads sorted by date
CREATE INDEX IF NOT EXISTS idx_private_messages_thread 
  ON public.private_messages(sender_id, receiver_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.private_messages ENABLE ROW LEVEL SECURITY;

-- Read Policy: sender or receiver only
CREATE POLICY "Users can read own private messages"
  ON public.private_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Write Policy: authenticated user can send, if not banned or muted
CREATE POLICY "Users can send private messages"
  ON public.private_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND (banned = true OR (muted_until IS NOT NULL AND muted_until > now()))
    )
  );

-- Enable Realtime
ALTER TABLE public.private_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'private_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.private_messages;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
