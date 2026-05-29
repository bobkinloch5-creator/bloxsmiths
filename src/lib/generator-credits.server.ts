import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function isGeneratorOwner(userId: string, supabase: any) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (roles ?? []).some((row: { role: string }) => row.role === "owner" || row.role === "admin");
}

export async function ensureCreditsAvailable(opts: {
  userId: string;
  amount: number;
  isOwner: boolean;
}) {
  if (opts.isOwner || opts.amount <= 0) return;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("credits")
    .eq("id", opts.userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const credits = data?.credits ?? 0;
  if (credits < opts.amount) {
    throw new Error("Not enough credits. Buy more on the Pricing page.");
  }
}

export async function spendCreditsAfterSuccess(opts: {
  supabase: any;
  amount: number;
  isOwner: boolean;
  insufficientMessage: string;
}) {
  if (opts.isOwner || opts.amount <= 0) return;
  const { error } = await opts.supabase.rpc("spend_credits_atomic", { _amount: opts.amount });
  if (error) throw new Error(opts.insufficientMessage);
}