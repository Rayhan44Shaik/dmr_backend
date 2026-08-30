export declare const env: {
    port: number;
    nodeEnv: string;
    databaseUrl: string;
    corsOrigin: string[];
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    smtpFrom: string;
};
export declare function smtpFlags(): Record<"SMTP_HOST" | "SMTP_PORT" | "SMTP_USER" | "SMTP_PASS" | "SMTP_FROM", boolean>;
