
import { supabase } from "./src/integrations/supabase/client";

async function check() {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, operation_number")
    .limit(1);
  
  if (error) {
    console.error("Error fetching invoices:", error);
  } else {
    console.log("Data fetched successfully:", data);
  }
}

check();
