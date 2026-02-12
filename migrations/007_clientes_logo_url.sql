-- Logo do cliente (SaaS: cada empresa com sua logo no webapp)
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL;

COMMENT ON COLUMN clientes.logo_url IS 'URL da logo exibida no webapp (Central do Consultor) para este cliente';
