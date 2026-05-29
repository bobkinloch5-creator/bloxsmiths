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

async function insertCreditTransaction(opts: {
  supabase: any;
  userId?: string;
  amount: number;
  reason: string;
}) {
  if (!opts.userId || opts.amount <= 0) return;
  try {
    await opts.supabase.from("credit_transactions").insert({
      user_id: opts.userId,
      amount: -Math.abs(opts.amount),
      type: "spend",
      reason: opts.reason,
    });
  } catch {
    // Some schemas log transactions inside spend_credits_atomic already.
  }
}

async function fallbackSpendCredits(opts: {
  supabase: any;
  userId?: string;
  amount: number;
  insufficientMessage: string;
  reason: string;
}) {
  if (!opts.userId) throw new Error(opts.insufficientMessage);

  const { data: profile, error: readError } = await opts.supabase
    .from("profiles")
    .select("credits")
    .eq("id", opts.userId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  const current = Number(profile?.credits ?? 0);
  if (current < opts.amount) throw new Error(opts.insufficientMessage);

  const { error: updateError } = await opts.supabase
    .from("profiles")
    .update({ credits: current - opts.amount, updated_at: new Date().toISOString() } as any)
    .eq("id", opts.userId)
    .eq("credits", current);

  if (updateError) throw new Error(updateError.message || opts.insufficientMessage);
  await insertCreditTransaction({
    supabase: opts.supabase,
    userId: opts.userId,
    amount: opts.amount,
    reason: opts.reason,
  });
}

export async function spendCreditsAfterSuccess(opts: {
  supabase: any;
  amount: number;
  isOwner: boolean;
  insufficientMessage: string;
  userId?: string;
  reason?: string;
}) {
  if (opts.isOwner || opts.amount <= 0) return;

  const reason = opts.reason ?? "AI generation";
  const { error } = await opts.supabase.rpc("spend_credits_atomic", { _amount: opts.amount });
  if (!error) {
    await insertCreditTransaction({
      supabase: opts.supabase,
      userId: opts.userId,
      amount: opts.amount,
      reason,
    });
    return;
  }

  // If the RPC is missing or broken on a fresh Supabase setup, still enforce
  // credit charging with a direct guarded balance update instead of letting
  // generations run free.
  const message = String(error.message ?? "");
  if (/function|schema cache|not found|does not exist|PGRST202|PGRST204/i.test(message)) {
    await fallbackSpendCredits({
      supabase: opts.supabase,
      userId: opts.userId,
      amount: opts.amount,
      insufficientMessage: opts.insufficientMessage,
      reason,
    });
    return;
  }

  throw new Error(opts.insufficientMessage);
}
