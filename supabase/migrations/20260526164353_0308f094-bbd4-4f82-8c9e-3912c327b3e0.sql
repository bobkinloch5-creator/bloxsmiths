ALTER TABLE public.agent_conversations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_agent_conversations_updated_at ON public.agent_conversations;
CREATE TRIGGER trg_agent_conversations_updated_at BEFORE UPDATE ON public.agent_conversations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();