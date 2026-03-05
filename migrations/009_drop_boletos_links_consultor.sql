-- Remove tabelas boletos e links_consultor (dados serão recriados via API/SGA).
-- Ordem: links_consultor não é referenciada por boletos; boletos não é referenciada por links_consultor.
DROP TABLE IF EXISTS links_consultor CASCADE;
DROP TABLE IF EXISTS boletos CASCADE;
