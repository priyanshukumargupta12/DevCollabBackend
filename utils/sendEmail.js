const nodemailer = require("nodemailer");

/**
 * Nodemailer transporter using Gmail SMTP (explicit settings — more reliable than service shorthand).
 *
 * Requires in .env:
 *   GMAIL_USER=you@gmail.com
 *   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   (16-char App Password, spaces are fine)
 *
 * Gmail App Password setup:
 *  1. Enable 2-Step Verification on your Google account
 *  2. Go to: myaccount.google.com → Security → App Passwords
 *  3. Generate one for "Mail" → paste it (with or without spaces)
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,           // STARTTLS port
    secure: false,        // false for port 587
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, ""), // strip spaces if any
    },
    tls: {
      rejectUnauthorized: false, // tolerate self-signed certs in dev
    },
    connectionTimeout: 5000, // 5 seconds connection timeout
    greetingTimeout: 5000,   // 5 seconds greeting timeout
    socketTimeout: 5000,     // 5 seconds socket timeout
  });
};

/**
 * Send an OTP email to the given address.
 * @param {string} to - Recipient email address
 * @param {string} otp - 6-digit plain-text OTP
 * @returns {Promise<void>}
 */
const sendOTPEmail = async (to, otp) => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn(`⚠️ [EMAIL WARNING] SMTP credentials missing. Skipping email send.`);
    console.log(`👉 [FALLBACK LOG] OTP for ${to}: ${otp}`);
    return;
  }
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"DevCollab Platform" <${process.env.GMAIL_USER || 'no-reply@devcollab.com'}>`,
      to,
      subject: "Your DevCollab Verification Code",
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>OTP Verification</title>
        </head>
        <body style="margin:0;padding:0;background:#0a0b0f;font-family:Inter,system-ui,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0b0f;padding:40px 0;">
            <tr>
              <td align="center">
                <table width="500" cellpadding="0" cellspacing="0"
                  style="background:linear-gradient(145deg,#0f1117,#13141e);
                         border:1px solid rgba(255,255,255,0.08);
                         border-radius:20px;
                         padding:40px;
                         max-width:500px;
                         width:100%;">
                  <!-- Logo -->
                  <tr>
                    <td align="center" style="padding-bottom:28px;">
                      <div style="width:52px;height:52px;border-radius:14px;
                                  background:linear-gradient(135deg,#8b5cf6,#6366f1,#3b82f6);
                                  display:inline-flex;align-items:center;justify-content:center;
                                  box-shadow:0 0 30px rgba(139,92,246,0.3);
                                  font-size:24px;line-height:52px;text-align:center;">
                        ⌨️
                      </div>
                      <h1 style="margin:16px 0 0;font-size:22px;font-weight:800;
                                 color:#f1f5f9;letter-spacing:-0.5px;">
                        DevCollab Platform
                      </h1>
                    </td>
                  </tr>
                  <!-- Title -->
                  <tr>
                    <td align="center" style="padding-bottom:8px;">
                      <h2 style="margin:0;font-size:18px;font-weight:600;color:#f1f5f9;">
                        Verification Code
                      </h2>
                      <p style="margin:8px 0 0;font-size:14px;color:#64748b;">
                        Use the code below to verify your identity. It expires in <strong style="color:#94a3b8;">10 minutes</strong>.
                      </p>
                    </td>
                  </tr>
                  <!-- OTP Box -->
                  <tr>
                    <td align="center" style="padding:28px 0;">
                      <div style="display:inline-block;
                                  background:rgba(139,92,246,0.1);
                                  border:1px solid rgba(139,92,246,0.4);
                                  border-radius:14px;
                                  padding:20px 40px;">
                        <span style="font-size:40px;font-weight:800;
                                     letter-spacing:12px;color:#a78bfa;
                                     font-family:monospace;">
                          ${otp}
                        </span>
                      </div>
                    </td>
                  </tr>
                  <!-- Warning -->
                  <tr>
                    <td align="center">
                      <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
                        If you didn't request this, please ignore this email.<br />
                        Never share this code with anyone.
                      </p>
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td align="center" style="padding-top:28px;
                                              border-top:1px solid rgba(255,255,255,0.06);
                                              margin-top:28px;">
                      <p style="margin:0;font-size:12px;color:#334155;">
                        © ${new Date().getFullYear()} DevCollab Platform. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ [EMAIL SUCCESS] OTP verification email sent successfully to ${to}`);
  } catch (error) {
    console.error(`❌ [EMAIL ERROR] Failed to send OTP email to ${to}:`, error.message);
    console.log(`👉 [FALLBACK LOG] OTP for ${to}: ${otp}`);
  }
};

/**
 * Reusable HTML template system.
 * Wraps content in a premium, modern dark-themed email container.
 */
const getEmailHTML = ({ title, subtitle, contentHtml, buttonText, buttonUrl, emoji = "⌨️" }) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title}</title>
    </head>
    <body style="margin:0;padding:0;background:#0a0b0f;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0b0f;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="500" cellpadding="0" cellspacing="0"
              style="background:linear-gradient(145deg,#0f1117,#13141e);
                     border:1px solid rgba(255,255,255,0.08);
                     border-radius:20px;
                     padding:40px;
                     max-width:500px;
                     width:100%;">
              <!-- Logo -->
              <tr>
                <td align="center" style="padding-bottom:28px;">
                  <div style="width:52px;height:52px;border-radius:14px;
                              background:linear-gradient(135deg,#8b5cf6,#6366f1,#3b82f6);
                              display:inline-flex;align-items:center;justify-content:center;
                              box-shadow:0 0 30px rgba(139,92,246,0.3);
                              font-size:24px;line-height:52px;text-align:center;
                              vertical-align:middle;color:#ffffff;">
                    ${emoji}
                  </div>
                  <h1 style="margin:16px 0 0;font-size:22px;font-weight:800;
                             color:#f1f5f9;letter-spacing:-0.5px;">
                    DevCollab Platform
                  </h1>
                </td>
              </tr>
              <!-- Title -->
              <tr>
                <td align="center" style="padding-bottom:16px;">
                  <h2 style="margin:0;font-size:18px;font-weight:600;color:#f1f5f9;">
                    ${subtitle}
                  </h2>
                </td>
              </tr>
              <!-- Content -->
              <tr>
                <td style="color:#94a3b8;font-size:14px;line-height:1.6;padding-bottom:24px;text-align:center;">
                  ${contentHtml}
                </td>
              </tr>
              <!-- Button (optional) -->
              ${buttonText && buttonUrl ? `
              <tr>
                <td align="center" style="padding-bottom:28px;">
                  <a href="${buttonUrl}" target="_blank"
                     style="display:inline-block;
                            background:linear-gradient(135deg,#8b5cf6,#6366f1);
                            color:#ffffff !important;
                            font-weight:600;
                            font-size:14px;
                            text-decoration:none;
                            padding:12px 30px;
                            border-radius:10px;
                            box-shadow:0 4px 15px rgba(139,92,246,0.25);">
                    ${buttonText}
                  </a>
                </td>
              </tr>
              ` : ''}
              <!-- Footer -->
              <tr>
                <td align="center" style="padding-top:28px;
                                          border-top:1px solid rgba(255,255,255,0.06);
                                          margin-top:28px;">
                  <p style="margin:0;font-size:12px;color:#334155;">
                    © ${new Date().getFullYear()} DevCollab Platform. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

/**
 * Helper: General-purpose mail sender.
 */
const sendMail = async (to, subject, html, fallbackInfo = {}) => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn(`⚠️ [EMAIL WARNING] SMTP credentials missing. Skipping email send.`);
    if (fallbackInfo.type) {
      console.log(`👉 [FALLBACK LOG] Type: ${fallbackInfo.type}`);
      console.log(`👉 [FALLBACK LOG] Recipient: ${to}`);
      for (const [key, value] of Object.entries(fallbackInfo.details || {})) {
        console.log(`👉 [FALLBACK LOG] ${key}: ${value}`);
      }
    }
    return;
  }
  try {
    const transporter = createTransporter();
    const mailOptions = {
      from: `"DevCollab Platform" <${process.env.GMAIL_USER || 'no-reply@devcollab.com'}>`,
      to,
      subject,
      html,
    };
    await transporter.sendMail(mailOptions);
    console.log(`✅ [EMAIL SUCCESS] Email sent successfully to ${to} (${subject})`);
  } catch (error) {
    console.error(`❌ [EMAIL ERROR] Failed to send email to ${to} (${subject}):`, error.message);
    if (fallbackInfo.type) {
      console.log(`👉 [FALLBACK LOG] Type: ${fallbackInfo.type}`);
      console.log(`👉 [FALLBACK LOG] Recipient: ${to}`);
      for (const [key, value] of Object.entries(fallbackInfo.details || {})) {
        console.log(`👉 [FALLBACK LOG] ${key}: ${value}`);
      }
    }
  }
};

/**
 * Send Welcome Email.
 */
const sendWelcomeEmail = async (to, username) => {
  const dashboardUrl = `${process.env.CLIENT_URL || "https://dev-collab-bice.vercel.app"}/dashboard`;
  const html = getEmailHTML({
    title: "Welcome to DevCollab",
    subtitle: `Welcome to the Platform, ${username}! 👋`,
    contentHtml: `We're excited to have you on board! DevCollab is a powerful, real-time collaboration space where developers can write code, manage tasks, coordinate with team members, and track updates in real-time.<br/><br/>Click below to visit your dashboard and get started.`,
    buttonText: "Go to Dashboard",
    buttonUrl: dashboardUrl,
    emoji: "👋",
  });
  await sendMail(to, "Welcome to DevCollab! 🎉", html, {
    type: "WELCOME_EMAIL",
    details: { username, dashboardUrl }
  });
};

/**
 * Send Password Reset Email.
 */
const sendPasswordResetEmail = async (to, username, resetUrl) => {
  const html = getEmailHTML({
    title: "Reset Your Password",
    subtitle: "Password Reset Request 🔒",
    contentHtml: `Hello ${username},<br/><br/>You requested to reset your password. Please click the button below to set a new password. This link is valid for <strong>1 hour</strong>.<br/><br/>If you did not request this reset, you can safely ignore this email. Your password will remain unchanged.`,
    buttonText: "Reset Password",
    buttonUrl: resetUrl,
    emoji: "🔒",
  });
  await sendMail(to, "DevCollab Password Reset Request", html, {
    type: "PASSWORD_RESET",
    details: { username, resetUrl }
  });
};

/**
 * Send Workspace Invite Email.
 */
const sendWorkspaceInviteEmail = async (to, inviteeName, inviterName, workspaceName, workspaceUrl) => {
  const html = getEmailHTML({
    title: "Workspace Invitation",
    subtitle: "You've Been Invited! 💼",
    contentHtml: `Hi ${inviteeName},<br/><br/><strong>${inviterName}</strong> has added you as a member to the workspace <strong>${workspaceName}</strong>.<br/><br/>Click below to join the workspace and start collaborating with your team!`,
    buttonText: "Open Workspace",
    buttonUrl: workspaceUrl,
    emoji: "💼",
  });
  await sendMail(to, `Invitation to join workspace "${workspaceName}"`, html, {
    type: "WORKSPACE_INVITE",
    details: { inviteeName, inviterName, workspaceName, workspaceUrl }
  });
};

/**
 * Send Task Assignment Email.
 */
const sendTaskAssignmentEmail = async (to, assigneeName, assignerName, taskTitle, workspaceName, taskUrl) => {
  const html = getEmailHTML({
    title: "Task Assigned",
    subtitle: "New Task Assigned 📋",
    contentHtml: `Hi ${assigneeName},<br/><br/><strong>${assignerName}</strong> has assigned a task to you in workspace <strong>${workspaceName}</strong>:<br/><br/><strong style="color: #f1f5f9; font-size: 16px;">${taskTitle}</strong><br/><br/>Click below to view the task details and update your progress.`,
    buttonText: "View Task",
    buttonUrl: taskUrl,
    emoji: "📋",
  });
  await sendMail(to, `New Task Assigned: "${taskTitle}"`, html, {
    type: "TASK_ASSIGNMENT",
    details: { assigneeName, assignerName, taskTitle, workspaceName, taskUrl }
  });
};

/**
 * Send Workspace Created Email.
 */
const sendWorkspaceCreatedEmail = async (to, ownerName, workspaceName, workspaceUrl) => {
  const html = getEmailHTML({
    title: "Workspace Created",
    subtitle: "Workspace Successfully Created! 🚀",
    contentHtml: `Hi ${ownerName},<br/><br/>Your new workspace <strong>${workspaceName}</strong> has been successfully created.<br/><br/>Click the button below to start building, adding members, and managing tasks in your new workspace!`,
    buttonText: "Go to Workspace",
    buttonUrl: workspaceUrl,
    emoji: "🚀",
  });
  await sendMail(to, `Your new workspace "${workspaceName}" is ready! 🚀`, html, {
    type: "WORKSPACE_CREATED",
    details: { ownerName, workspaceName, workspaceUrl }
  });
};

module.exports = {
  sendOTPEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendWorkspaceInviteEmail,
  sendTaskAssignmentEmail,
  sendWorkspaceCreatedEmail,
};
