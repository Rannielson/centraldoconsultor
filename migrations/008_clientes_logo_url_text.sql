-- Permite URLs longas (ex.: CDN Instagram) na logo do cliente
ALTER TABLE clientes
  ALTER COLUMN logo_url TYPE TEXT;
