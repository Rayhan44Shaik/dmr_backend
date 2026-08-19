/**
 * Safe SMTP configuration + Gmail connection check.
 * Prints booleans only — never prints credentials.
 */
import { smtpFlags } from "../config/env.js";
import { isSmtpConfigured, smtpService } from "../services/smtpService.js";

const flags = smtpFlags();
console.log(`SMTP_HOST configured: ${flags.SMTP_HOST}`);
console.log(`SMTP_PORT configured: ${flags.SMTP_PORT}`);
console.log(`SMTP_USER configured: ${flags.SMTP_USER}`);
console.log(`SMTP_PASS configured: ${flags.SMTP_PASS}`);
console.log(`SMTP_FROM configured: ${flags.SMTP_FROM}`);
console.log(`SMTP isConfigured: ${isSmtpConfigured()}`);

const result = await smtpService.verifyConnection();
console.log(`SMTP configured: ${result.configured}`);
console.log(`SMTP connected: ${result.connected}`);
if (!result.configured) process.exitCode = 2;
else if (!result.connected) process.exitCode = 3;
