-- =====================================================
-- Adiciona short_code para URL curta (sem expor API key na URL)
-- =====================================================

ALTER TABLE links_consultor
  ADD COLUMN IF NOT EXISTS short_code VARCHAR(8) UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_links_consultor_short_code ON links_consultor(short_code) WHERE short_code IS NOT NULL;

COMMENT ON COLUMN links_consultor.short_code IS 'Código curto para URL /app/s/:code (key injetada no HTML, não exposta na URL)';
