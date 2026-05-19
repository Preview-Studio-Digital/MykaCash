import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const USERNAME_DOMAIN = "smartmoney.local";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const targetId = String(body.user_id ?? "").trim();
    if (!targetId) {
      return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUsername = body.username != null ? String(body.username).trim().toLowerCase() : undefined;
    const newDisplayName = body.display_name != null ? String(body.display_name).trim() : undefined;
    const newPassword = body.password != null && String(body.password).length > 0 ? String(body.password) : undefined;
    const isAdminFlag = body.is_admin != null ? Boolean(body.is_admin) : undefined;

    let emailToUpdate: string | undefined = undefined;
    let usernameToUpdate: string | undefined = undefined;

    if (newUsername !== undefined && newUsername.length > 0) {
      if (newUsername.includes("@")) {
        emailToUpdate = newUsername;
        usernameToUpdate = newUsername;
      } else {
        if (!/^[a-z0-9_.-]{3,32}$/.test(newUsername)) {
          return new Response(
            JSON.stringify({ error: "Usuário inválido (3-32 caracteres: a-z, 0-9, . _ -)" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        emailToUpdate = `${newUsername}@${USERNAME_DOMAIN}`;
        usernameToUpdate = newUsername;
      }
    }

    if (newPassword !== undefined && (newPassword.length < 6 || newPassword.length > 72)) {
      return new Response(
        JSON.stringify({ error: "Senha deve ter entre 6 e 72 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Update auth user (email/password/metadata)
    const authUpdate: Record<string, unknown> = {};
    if (emailToUpdate !== undefined) {
      authUpdate.email = emailToUpdate;
    }
    if (newPassword !== undefined) authUpdate.password = newPassword;
    if (usernameToUpdate !== undefined || newDisplayName !== undefined) {
      authUpdate.user_metadata = {
        ...(usernameToUpdate !== undefined ? { username: usernameToUpdate } : {}),
        ...(newDisplayName !== undefined ? { display_name: newDisplayName } : {}),
      };
    }

    if (Object.keys(authUpdate).length > 0) {
      const { error: upErr } = await admin.auth.admin.updateUserById(targetId, authUpdate);
      if (upErr) {
        const raw = upErr.message ?? "";
        let friendly = raw;
        if (/weak|pwned|known to be/i.test(raw)) {
          friendly = "Senha muito fraca ou já vazada em outros sites. Use uma senha mais forte (combine letras, números e símbolos).";
        }
        return new Response(JSON.stringify({ error: friendly }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update profile
    const profileUpdate: Record<string, unknown> = {};
    if (usernameToUpdate !== undefined) profileUpdate.username = usernameToUpdate;
    if (newDisplayName !== undefined) profileUpdate.display_name = newDisplayName;
    if (Object.keys(profileUpdate).length > 0) {
      await admin.from("profiles").update(profileUpdate).eq("id", targetId);
    }

    // Update role if specified
    if (isAdminFlag !== undefined) {
      // Prevent demoting yourself (avoid losing last admin accidentally)
      if (targetId === userData.user.id && !isAdminFlag) {
        return new Response(
          JSON.stringify({ error: "Você não pode remover seu próprio acesso de administrador" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Remove existing roles, then insert the new one
      await admin.from("user_roles").delete().eq("user_id", targetId);
      await admin.from("user_roles").insert({
        user_id: targetId,
        role: isAdminFlag ? "admin" : "user",
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
