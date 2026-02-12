-- =====================================================
-- Adiciona dados de pagamento na tabela boletos (SGA detalhe)
-- =====================================================

ALTER TABLE boletos
  ADD COLUMN IF NOT EXISTS pix_copia_cola TEXT,
  ADD COLUMN IF NOT EXISTS link_boleto VARCHAR(500);

COMMENT ON COLUMN boletos.pix_copia_cola IS 'Código PIX copia e cola retornado pela API SGA ao carregar detalhe do boleto';
COMMENT ON COLUMN boletos.link_boleto IS 'URL do PDF do boleto (link_boleto ou short_link da SGA)';
