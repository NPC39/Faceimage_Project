/**
 * Password Reset Email Delivery Helper
 * 
 * In production, this module can be updated to send emails via Resend, SendGrid, AWS SES, or SMTP.
 * In development mode, reset URLs are logged directly to the server console for Docker / local testing.
 */

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  // Always log to server console for local/dev visibility
  console.log(`\n========================================`);
  console.log(`[DEV EMAIL] Password reset requested for: ${email}`);
  console.log(`Password reset link: ${resetUrl}`);
  console.log(`========================================\n`);

  // Future production email provider dispatch:
  // if (process.env.EMAIL_SERVER && process.env.EMAIL_FROM) {
  //   ... send email ...
  // }
}
