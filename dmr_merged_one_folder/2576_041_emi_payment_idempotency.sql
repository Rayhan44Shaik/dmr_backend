-- EMI payment idempotency: a Retry after a successful pay whose HTTP response
-- was lost must reuse the same client key and must not mark another installment.
CREATE TABLE IF NOT EXISTS vehicle_emi_payment_keys (
  id               SERIAL PRIMARY KEY,
  vehicle_emi_id   INTEGER NOT NULL REFERENCES vehicle_emis(id) ON DELETE CASCADE,
  idempotency_key  VARCHAR(128) NOT NULL,
  installment_id   INTEGER NOT NULL REFERENCES vehicle_emi_installments(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vehicle_emi_payment_keys UNIQUE (vehicle_emi_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_emi_payment_keys_installment
  ON vehicle_emi_payment_keys (installment_id);
