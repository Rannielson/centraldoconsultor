-- =====================================================
-- Adiciona situação do veículo na tabela boletos (vinda da API SGA)
-- =====================================================

ALTER TABLE boletos
  ADD COLUMN IF NOT EXISTS situacao_veiculo VARCHAR(50);

COMMENT ON COLUMN boletos.situacao_veiculo IS 'Situação do veículo retornada pela API SGA (ex: ATIVO, INADIMPLENTE, REGULAR)';
