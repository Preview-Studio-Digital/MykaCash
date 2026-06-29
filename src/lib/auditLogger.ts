import { supabase } from "@/integrations/supabase/client";

export const logOperationAction = async (
  action: "CREATE" | "UPDATE" | "SETTLE" | "UNSETTLE" | "DELETE",
  opNumber: string,
  clientName: string,
  invoiceNumber: string,
  details?: string
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
    
    const { error } = await supabase.from("operation_logs").insert({
      action,
      op_number: opNumber,
      client_name: clientName,
      invoice_number: invoiceNumber,
      author,
      details: details || null,
    });
    if (error) {
      console.error("Erro ao inserir log:", error);
    }
  } catch (err) {
    console.error("Erro ao registrar log da operacao:", err);
  }
};
