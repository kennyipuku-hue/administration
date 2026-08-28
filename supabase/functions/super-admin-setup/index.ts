import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // GET: check if a super admin already exists (used by the login page)
  // This bypasses RLS so unauthenticated users can determine whether to show
  // the setup page or the login page.
  if (req.method === "GET") {
    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("role", "super_admin")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return json({ superAdminExists: !!data });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return json({ error: message }, 500);
    }
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { firstName, surname, email, password } = await req.json();

    if (!firstName || !surname || !email || !password) {
      return json({ error: "All fields are required" }, 400);
    }
    if (password.length < 12) {
      return json({ error: "Password must be at least 12 characters" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Invalid email address" }, 400);
    }

    // Check if any active super_admin already exists
    const { data: existingAdmin, error: checkErr } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("role", "super_admin")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (checkErr) throw checkErr;
    if (existingAdmin) {
      return json({ error: "A Super Admin already exists. Initial setup is locked." }, 403);
    }

    // Check for duplicate auth user
    const { data: existingUser, error: dupErr } = await supabase.auth.admin
      .listUsers();
    if (dupErr) throw dupErr;
    const emailExists = existingUser.users.some(
      (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (emailExists) {
      return json({ error: "An account with this email already exists" }, 409);
    }

    // Create the auth user
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, surname },
    });

    if (authErr) throw authErr;
    const userId = authData.user.id;

    // Insert the profile as super_admin
    const { error: profileErr } = await supabase.from("user_profiles").insert({
      id: userId,
      first_name: firstName,
      surname,
      email,
      role: "super_admin",
      status: "active",
    });

    if (profileErr) {
      // Best-effort cleanup
      await supabase.auth.admin.deleteUser(userId);
      throw profileErr;
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      actor_id: userId,
      actor_email: email,
      action: "super_admin_created",
      entity_type: "user_profile",
      entity_id: userId,
      details: { method: "initial_setup", email },
    });

    return json({ success: true, message: "Super Admin account created successfully" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
