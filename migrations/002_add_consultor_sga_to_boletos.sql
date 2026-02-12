-- =====================================================
-- Adiciona id_consultor_sga e nome_consultor na tabela boletos
-- =====================================================

ALTER TABLE boletos
  ADD COLUMN IF NOT EXISTS id_consultor_sga VARCHAR(50),
  ADD COLUMN IF NOT EXISTS nome_consultor VARCHAR(255);

COMMENT ON COLUMN boletos.id_consultor_sga IS 'ID do consultor na API SGA';
COMMENT ON COLUMN boletos.nome_consultor IS 'Nome do consultor';

-- Apaga todos os dados da tabela boletos (conforme solicitado)
TRUNCATE TABLE boletos RESTART IDENTITY;
