import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";

export type SmtpAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

function isConfigured(): boolean {
  if (!env.smtpHost) return false;
  if (env.smtpHost === "json") return true;
  return Boolean(env.smtpUser && env.smtpPass);
}

function createTransport() {
  if (env.smtpHost === "json") {
    return nodemailer.createTransport({ jsonTransport: true });
  }
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });
}

export const smtpService = {
  isConfigured,

  async sendMail(input: {
    to: string;
    subject: string;
    text: string;
    attachments: SmtpAttachment[];
  }): Promise<void> {
    if (!isConfigured()) {
      throw new AppError(422, "SMTP provider is not configured.");
    }
    const from = env.smtpFrom || env.smtpUser;
    const transporter = createTransport();
    await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      attachments: input.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType ?? "application/pdf",
      })),
    });
  },
};
