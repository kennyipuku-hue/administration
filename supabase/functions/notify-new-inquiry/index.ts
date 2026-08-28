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
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { inquiryId } = await req.json();

    if (!inquiryId) {
      return json({ error: "inquiryId is required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fetch the full inquiry record
    const { data: inquiry, error: fetchErr } = await supabase
      .from("inquiries")
      .select("*")
      .eq("id", inquiryId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!inquiry) {
      return json({ error: "Inquiry not found" }, 404);
    }

    // Determine the practice notification email — check system_settings first,
    // then fall back to a default.
    const { data: settings } = await supabase
      .from("system_settings")
      .select("practice_name, practice_email")
      .limit(1)
      .maybeSingle();

    const practiceName = settings?.practice_name ?? "Medical GP Practice";
    const notifyEmail = settings?.practice_email ?? "admin@healthorgsolutions.co.za";

    // Build the admin URL for the "View Inquiry" link
    const adminUrl = `${Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", "") ?? ""}`;
    // We don't know the Website 2 URL server-side, so we use the SUPABASE_URL
    // environment as a base. In practice, the PRACTICE_ADMIN_URL env var should
    // be set to the admin site URL.
    const adminSiteUrl = Deno.env.get("PRACTICE_ADMIN_URL") ?? "https://your-admin-site.com";
    const viewLink = `${adminSiteUrl}/?inquiry=${inquiry.id}`;

    const emailSubject = `New Website Inquiry — ${inquiry.patient_name}`;
    const emailBody = `New website inquiry received.

Name: ${inquiry.patient_name}
Email: ${inquiry.patient_email}
Phone: ${inquiry.phone ?? "Not provided"}
Subject: ${inquiry.subject}
Message: ${inquiry.message}
Date: ${new Date(inquiry.created_at).toLocaleString("en-ZA")}

View this inquiry in the admin system:
${viewLink}

---
This is an automated notification from ${practiceName}.`;

    let emailSent = false;
    let emailError: string | null = null;

    try {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) {
        emailError = "RESEND_API_KEY is not configured";
      } else {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${practiceName} <noreply@healthorgsolutions.co.za>`,
            to: notifyEmail,
            subject: emailSubject,
            text: emailBody,
            reply_to: inquiry.patient_email,
          }),
        });

        if (emailRes.ok) {
          emailSent = true;
        } else {
          const errText = await emailRes.text();
          emailError = `Resend returned ${emailRes.status}: ${errText}`;
        }
      }
    } catch (sendErr) {
      emailError = sendErr instanceof Error ? sendErr.message : "Email send failed";
    }

    // Update the inquiry's email_status based on the notification result.
    // Only update if the current email_status is 'pending' — don't overwrite
    // a reply email_status that may have been set by send-inquiry-reply.
    if (emailSent) {
      await supabase
        .from("inquiries")
        .update({ email_status: "sent", updated_at: new Date().toISOString() })
        .eq("id", inquiryId)
        .eq("email_status", "pending");
    } else {
      await supabase
        .from("inquiries")
        .update({ email_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", inquiryId)
        .eq("email_status", "pending");
    }

    // Audit log the notification attempt
    await supabase.from("audit_logs").insert({
      action: "inquiry_notification_email",
      entity_type: "inquiry",
      entity_id: inquiryId,
      details: {
        email_sent: emailSent,
        email_error: emailError,
        recipient: notifyEmail,
      },
    });

    if (emailSent) {
      return json({ success: true, message: "Notification email sent to practice", emailSent: true });
    } else {
      return json({ success: false, message: "Inquiry saved but notification email failed", emailSent: false, emailError });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
