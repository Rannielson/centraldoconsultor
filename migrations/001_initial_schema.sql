-- =====================================================
-- API Central do Consultor - Schema Inicial
-- =====================================================

-- Extensão para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Tabela: api_keys
-- Armazena as chaves de API para autenticação
-- =====================================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) UNIQUE NOT NULL,
    descricao VARCHAR(255),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para busca rápida por key
CREATE INDEX idx_api_keys_key ON api_keys(key) WHERE ativo = true;

-- =====================================================
-- Tabela: clientes
-- Armazena os clientes (cooperativas)
-- =====================================================
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    token_bearer TEXT NOT NULL,
    url_base_api VARCHAR(500) NOT NULL DEFAULT 'https://api.hinova.com.br/api/sga/v2',
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para busca de clientes ativos
CREATE INDEX idx_clientes_ativo ON clientes(ativo);

-- =====================================================
-- Tabela: consultores
-- Armazena os consultores vinculados aos clientes
-- =====================================================
CREATE TABLE IF NOT EXISTS consultores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    id_consultor_sga VARCHAR(50) NOT NULL,
    contato VARCHAR(100),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para consultas otimizadas
CREATE INDEX idx_consultores_cliente_id ON consultores(cliente_id);
CREATE INDEX idx_consultores_ativo ON consultores(ativo);
CREATE INDEX idx_consultores_id_sga ON consultores(id_consultor_sga);

-- Constraint única: um consultor SGA por cliente
CREATE UNIQUE INDEX idx_consultores_unique ON consultores(cliente_id, id_consultor_sga);

-- =====================================================
-- Tabela: configuracoes_filtro
-- Armazena as configurações de filtro por cliente
-- =====================================================
CREATE TABLE IF NOT EXISTS configuracoes_filtro (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    situacoes_veiculo_aceitas JSONB NOT NULL DEFAULT '["ATIVO"]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Um cliente tem apenas uma configuração
CREATE UNIQUE INDEX idx_configuracoes_cliente ON configuracoes_filtro(cliente_id);

-- =====================================================
-- Tabela: boletos
-- Armazena os boletos sincronizados da API SGA
-- =====================================================
CREATE TABLE IF NOT EXISTS boletos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    consultor_id UUID NOT NULL REFERENCES consultores(id) ON DELETE CASCADE,
    nosso_numero VARCHAR(50) NOT NULL,
    linha_digitavel VARCHAR(100),
    valor_boleto DECIMAL(10, 2),
    nome_associado VARCHAR(255),
    cpf_associado VARCHAR(14),
    celular VARCHAR(20),
    data_vencimento DATE,
    situacao_boleto VARCHAR(50),
    modelo_veiculo VARCHAR(255),
    placa_veiculo VARCHAR(20),
    mes_referente VARCHAR(10),
    dados_completos JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para consultas otimizadas
CREATE INDEX idx_boletos_cliente_id ON boletos(cliente_id);
CREATE INDEX idx_boletos_consultor_id ON boletos(consultor_id);
CREATE INDEX idx_boletos_data_vencimento ON boletos(data_vencimento);
CREATE INDEX idx_boletos_situacao ON boletos(situacao_boleto);
CREATE INDEX idx_boletos_nosso_numero ON boletos(nosso_numero);

-- Constraint única: nosso_numero por cliente
CREATE UNIQUE INDEX idx_boletos_unique ON boletos(cliente_id, nosso_numero);

-- =====================================================
-- Triggers para atualizar updated_at automaticamente
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON clientes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_consultores_updated_at BEFORE UPDATE ON consultores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_configuracoes_updated_at BEFORE UPDATE ON configuracoes_filtro
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_boletos_updated_at BEFORE UPDATE ON boletos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Dados iniciais: API Key Master
-- =====================================================
INSERT INTO api_keys (key, descricao, ativo)
VALUES ('master-key-12345-central-consultor', 'API Key Master', true)
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- Comentários nas tabelas
-- =====================================================
COMMENT ON TABLE api_keys IS 'Chaves de API para autenticação dos endpoints';
COMMENT ON TABLE clientes IS 'Clientes (cooperativas) que utilizam o sistema';
COMMENT ON TABLE consultores IS 'Consultores vinculados aos clientes';
COMMENT ON TABLE configuracoes_filtro IS 'Configurações de filtro de situação de veículo por cliente';
COMMENT ON TABLE boletos IS 'Boletos sincronizados da API SGA';
