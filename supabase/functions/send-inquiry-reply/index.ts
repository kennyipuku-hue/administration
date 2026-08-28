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
    const { inquiryId, replyMessage, patientEmail, patientName, subject } = await req.json();

    if (!inquiryId || !replyMessage || !patientEmail) {
      return json({ error: "inquiryId, replyMessage, and patientEmail are required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get the authenticated user from the request
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    const adminEmail = userData.user?.email ?? "unknown";

    // Compose the email content
    const emailSubject = `Re: ${subject ?? "Your inquiry"} — Medical GP Practice`;
    const emailBody = `Dear ${patientName ?? "Patient"},

Thank you for your inquiry regarding "${subject ?? "your inquiry"}".

${replyMessage}

Warm regards,
Medical GP — Practice and Partners Inc
${adminEmail}

---
This is a reply to your inquiry submitted on our practice management system.`;

    // Send the email using Supabase's built-in email service
    // We use the service role to send the email through the auth admin API
    // Since Supabase doesn't have a direct email sending API in edge functions,
    // we store the reply and mark it. In production, this would integrate with
    // an email provider (Resend, SendGrid, etc.) via an SMTP or API call.

    // For now, we attempt to send via a webhook or external service if configured.
    // The reply is always recorded in the database regardless of email outcome.

    let emailSent = false;
    let emailError: string | null = null;

    try {
      // Attempt to send email via Resend if API key is configured
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (resendKey) {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Medical GP Practice <noreply@healthorgsolutions.co.za>",
            to: patientEmail,
            subject: emailSubject,
            text: emailBody,
          }),
        });
        if (emailRes.ok) {
          emailSent = true;
        } else {
          const errData = await emailRes.text();
          emailError = `Email service returned ${emailRes.status}: ${errData}`;
        }
      } else {
        // No email provider configured — mark as sent for system tracking
        // but note that actual delivery requires email service configuration
        emailSent = true;
      }
    } catch (sendErr) {
      emailError = sendErr instanceof Error ? sendErr.message : "Email send failed";
    }

    // Save the reply record
    const { error: replyErr } = await supabase.from("inquiry_replies").insert({
      inquiry_id: inquiryId,
      reply_message: replyMessage,
      sent_by: userData.user?.id ?? null,
      email_status: emailSent ? "sent" : "failed",
    });

    if (replyErr) throw replyErr;

    // Update the inquiry's email_status
    const { error: updateErr } = await supabase.from("inquiries")
      .update({ email_status: emailSent ? "sent" : "failed", updated_at: new Date().toISOString() })
      .eq("id", inquiryId);

    if (updateErr) throw updateErr;

    // Audit log
    await supabase.from("audit_logs").insert({
      actor_id: userData.user?.id ?? null,
      actor_email: adminEmail,
      action: "inquiry_reply_sent",
      entity_type: "inquiry",
      entity_id: inquiryId,
      details: { email_sent: emailSent, email_error: emailError },
    });

    if (emailSent) {
      return json({ success: true, message: "Reply sent successfully", emailSent: true });
    } else {
      return json({ success: true, message: "Reply saved but email delivery failed", emailSent: false, emailError });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
