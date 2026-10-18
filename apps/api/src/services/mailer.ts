import nodemailer from "nodemailer";

// Account emails (password reset). Sent through SMTP_URL, e.g. smtps://user:app-password@smtp.gmail.com:465.
// Without it the server says reset emails are not set up; it never pretends one was sent.
export const mailConfigured = () => !!process.env.SMTP_URL;

/** Swappable in tests. */
export const mailer = {
  async send(to: string, subject: string, text: string) {
    const transport = nodemailer.createTransport(process.env.SMTP_URL!);
    await transport.sendMail({ from: process.env.MAIL_FROM || "Triagedesk <no-reply@triagedesk.app>", to, subject, text });
  },
};
