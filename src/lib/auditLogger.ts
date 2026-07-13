import { supabase } from "@/integrations/supabase/client";

export const logOperationAction = async (
  action: "CREATE" | "UPDATE" | "SETTLE" | "UNSETTLE" | "DELETE" | "ADDITIONAL",
  opNumber: string,
  clientName: string,
  invoiceNumber: string,
  details?: string,
  value?: number
) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    // Fetch profile for display_name or username
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", user.id)
      .maybeSingle();
      
    const author = profile?.display_name || profile?.username || user.email || "Usuário";
    
    const logData: any = {
      action,
      op_number: opNumber,
      client_name: clientName,
      invoice_number: invoiceNumber,
      author,
      details: details || null,
    };

    if (value !== undefined) {
      logData.value = value;
    }
    
    let { error } = await supabase.from("operation_logs").insert(logData);
    
    // Fallback: If column "value" does not exist in the database (unmigrated database), retry without it.
    // PostgreSQL error code for undefined_column is '42703'
    if (error && (error.code === "42703" || error.code === "PGRST204" || error.message?.toLowerCase().includes("'value'") || error.message?.includes("column \"value\" of relation \"operation_logs\" does not exist"))) {
      console.warn("Operation_logs table doesn't have 'value' column yet. Retrying without it.");
      delete logData.value;
      const retry = await supabase.from("operation_logs").insert(logData);
      error = retry.error;
    }

    if (error) {
      console.error("Erro ao inserir log:", error);
    }
  } catch (err) {
    console.error("Erro ao registrar log da operacao:", err);
  }
};
