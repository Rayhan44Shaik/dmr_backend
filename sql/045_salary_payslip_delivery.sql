-- Durable, idempotent Salary Register delivery outbox.
CREATE TABLE IF NOT EXISTS salary_payslip_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salary_id UUID NOT NULL REFERENCES salary_records(id) ON DELETE RESTRICT,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email','whatsapp')),
  recipient VARCHAR(320) NOT NULL,
  language VARCHAR(2) NOT NULL DEFAULT 'en' CHECK (language IN ('en','te')),
  subject VARCHAR(300),
  message_body TEXT NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Queued' CHECK (status IN ('Queued','Sending','Sent','Failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  queued_by VARCHAR(200) NOT NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  UNIQUE (salary_id, channel, payload_hash)
);
CREATE INDEX IF NOT EXISTS idx_salary_delivery_status_queued
  ON salary_payslip_deliveries(status, queued_at);
CREATE INDEX IF NOT EXISTS idx_salary_delivery_salary
  ON salary_payslip_deliveries(salary_id, channel);
