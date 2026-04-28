// Maps Supabase/Postgres errors to friendly Portuguese messages.
// Avoid leaking raw constraint names, table names or RLS details to end users.
export const friendlyDbError = (error: unknown, fallback = "Ocorreu um erro. Tente novamente."): string => {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return fallback;
  switch (e.code) {
    case "23505":
      return "Registro duplicado.";
    case "23503":
      return "Não é possível concluir: existem registros vinculados.";
    case "23502":
      return "Preencha todos os campos obrigatórios.";
    case "42501":
    case "PGRST301":
      return "Você não tem permissão para esta ação.";
  }
  if (e.message && /row-level security|permission denied|not authorized/i.test(e.message)) {
    return "Você não tem permissão para esta ação.";
  }
  return fallback;
};
