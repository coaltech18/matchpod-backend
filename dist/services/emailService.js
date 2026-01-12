"use strict";
/**
 * Email Service - Fire-and-forget email sending for MatchPod
 *
 * Phase 2: Uses centralized config for email settings
 *
 * For beta: Logs email attempts (simulated sending)
 * For production: Configure SMTP/SendGrid/SES settings
 *
 * IMPORTANT:
 * - All email sending is async and non-blocking
 * - Failures are logged but never thrown
 * - No retries or queues for beta
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWelcomeEmail = sendWelcomeEmail;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
/**
 * Get email configuration from centralized config
 */
function getEmailConfiguration() {
    const cfg = (0, env_1.getEmailConfig)();
    return {
        enabled: cfg.enabled,
        provider: cfg.provider,
        fromEmail: cfg.fromEmail,
        fromName: cfg.fromName,
        sendgridApiKey: cfg.sendgridApiKey || '',
        appUrl: cfg.appUrl,
    };
}
/**
 * Log email attempt (for development/beta)
 */
function logEmailAttempt(type, payload, context) {
    const timestamp = new Date().toISOString();
    const logData = {
        timestamp,
        type: `email_${type}`,
        to: payload.to,
        subject: payload.subject,
        userId: context.userId,
        error: context.error,
    };
    if (type === 'failure') {
        console.error('[EmailService]', JSON.stringify(logData));
    }
    else {
        console.log('[EmailService]', JSON.stringify(logData));
    }
}
/**
 * Send email via SendGrid (when configured)
 */
async function sendViaSendGrid(payload) {
    const emailConfig = getEmailConfiguration();
    if (!emailConfig.sendgridApiKey) {
        return { success: false, error: 'SendGrid API key not configured' };
    }
    try {
        const response = await axios_1.default.post('https://api.sendgrid.com/v3/mail/send', {
            personalizations: [{ to: [{ email: payload.to }] }],
            from: { email: emailConfig.fromEmail, name: emailConfig.fromName },
            subject: payload.subject,
            content: [
                { type: 'text/plain', value: payload.text || '' },
                { type: 'text/html', value: payload.html },
            ],
        }, {
            headers: {
                Authorization: `Bearer ${emailConfig.sendgridApiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 10000, // 10 second timeout
        });
        return {
            success: true,
            messageId: response.headers['x-message-id'] || 'sent',
        };
    }
    catch (error) {
        return {
            success: false,
            error: error.message || 'SendGrid request failed',
        };
    }
}
/**
 * Send email (main entry point)
 * Non-blocking, fire-and-forget
 */
async function sendEmail(payload, context = {}) {
    // Log the attempt
    logEmailAttempt('send', payload, context);
    try {
        const emailConfig = getEmailConfiguration();
        let result;
        if (!emailConfig.enabled || emailConfig.provider === 'log') {
            // For beta/development: Just log, don't actually send
            console.log('[EmailService] Email logged (not sent - beta mode)');
            console.log('[EmailService] To:', payload.to);
            console.log('[EmailService] Subject:', payload.subject);
            console.log('[EmailService] Content preview:', payload.html.substring(0, 200) + '...');
            result = { success: true, messageId: 'logged-' + Date.now() };
        }
        else if (emailConfig.provider === 'sendgrid') {
            result = await sendViaSendGrid(payload);
        }
        else {
            result = { success: false, error: `Unknown provider: ${emailConfig.provider}` };
        }
        if (result.success) {
            logEmailAttempt('success', payload, { ...context });
        }
        else {
            logEmailAttempt('failure', payload, { ...context, error: result.error });
        }
        return result;
    }
    catch (error) {
        // NEVER throw - just log and return failure
        const errorMessage = error.message || 'Unknown error';
        logEmailAttempt('failure', payload, { ...context, error: errorMessage });
        return { success: false, error: errorMessage };
    }
}
/**
 * Generate welcome email HTML content
 * Does NOT include sensitive data
 */
function generateWelcomeEmailHtml(userName, appUrl) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to MatchPod!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Welcome to MatchPod! 🎉</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px 30px;">
        <p style="color: #333333; font-size: 18px; line-height: 1.6; margin: 0 0 20px;">
          Hi ${userName},
        </p>
        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
          Your MatchPod profile is now complete! 🏠
        </p>
        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
          You're all set to start finding your perfect roommate in Bengaluru. Here's what you can do now:
        </p>
        <ul style="color: #555555; font-size: 16px; line-height: 1.8; padding-left: 20px; margin: 0 0 30px;">
          <li>Browse potential roommates</li>
          <li>Swipe right on matches you like</li>
          <li>Start conversations with mutual matches</li>
          <li>Update your preferences anytime</li>
        </ul>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${appUrl}" style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
            Open MatchPod
          </a>
        </div>
        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 10px;">
          Happy matching! 🤝
        </p>
        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0;">
          The MatchPod Team
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 20px 30px; background-color: #f9f9f9; text-align: center; border-top: 1px solid #eeeeee;">
        <p style="color: #999999; font-size: 12px; line-height: 1.5; margin: 0 0 10px;">
          You received this email because you signed up for MatchPod.
        </p>
        <p style="color: #999999; font-size: 12px; line-height: 1.5; margin: 0;">
          <a href="${appUrl}/unsubscribe" style="color: #667eea; text-decoration: underline;">Unsubscribe</a> | 
          <a href="${appUrl}/privacy" style="color: #667eea; text-decoration: underline;">Privacy Policy</a>
        </p>
        <p style="color: #cccccc; font-size: 11px; margin-top: 15px;">
          © ${new Date().getFullYear()} MatchPod. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
/**
 * Generate welcome email plain text content
 */
function generateWelcomeEmailText(userName, appUrl) {
    return `
Welcome to MatchPod! 🎉

Hi ${userName},

Your MatchPod profile is now complete!

You're all set to start finding your perfect roommate in Bengaluru. Here's what you can do now:

• Browse potential roommates
• Swipe right on matches you like
• Start conversations with mutual matches
• Update your preferences anytime

Open MatchPod: ${appUrl}

Happy matching! 🤝
The MatchPod Team

---
You received this email because you signed up for MatchPod.
Unsubscribe: ${appUrl}/unsubscribe

© ${new Date().getFullYear()} MatchPod. All rights reserved.
  `.trim();
}
/**
 * Send welcome email after onboarding completion
 *
 * FIRE-AND-FORGET: This function does not throw
 * Caller should NOT await if non-blocking behavior is desired
 *
 * @param email - User's email address
 * @param userName - User's display name
 * @param userId - User ID for logging context
 */
async function sendWelcomeEmail(email, userName, userId) {
    try {
        console.log(`[EmailService] Sending welcome email to ${email} for user ${userId}`);
        const emailConfig = getEmailConfiguration();
        const result = await sendEmail({
            to: email,
            subject: 'Welcome to MatchPod! 🎉',
            html: generateWelcomeEmailHtml(userName, emailConfig.appUrl),
            text: generateWelcomeEmailText(userName, emailConfig.appUrl),
        }, { userId });
        if (result.success) {
            console.log(`[EmailService] Welcome email sent successfully to ${email}`);
        }
        else {
            console.error(`[EmailService] Failed to send welcome email to ${email}: ${result.error}`);
        }
        return result;
    }
    catch (error) {
        // NEVER throw - always return a result
        const errorMessage = error.message || 'Unknown error in sendWelcomeEmail';
        console.error(`[EmailService] Exception sending welcome email to ${email}: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}
exports.default = {
    sendWelcomeEmail,
};
