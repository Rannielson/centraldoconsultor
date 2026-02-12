-- =====================================================
-- Tabela: links_consultor - Links públicos por consultor e competência
-- =====================================================

CREATE TABLE IF NOT EXISTS links_consultor (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    consultor_id UUID NOT NULL REFERENCES consultores(id) ON DELETE CASCADE,
    competencia VARCHAR(7) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    url_completa TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_links_consultor_cliente_consultor_competencia
  ON links_consultor(cliente_id, consultor_id, competencia);

CREATE INDEX IF NOT EXISTS idx_links_consultor_slug ON links_consultor(slug);
CREATE INDEX IF NOT EXISTS idx_links_consultor_cliente_competencia ON links_consultor(cliente_id, competencia);

CREATE TRIGGER update_links_consultor_updated_at
  BEFORE UPDATE ON links_consultor
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE links_consultor IS 'Links públicos por consultor e competência para acesso ao webapp';
