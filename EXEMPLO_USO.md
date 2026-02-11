# Exemplo de Uso - API Central do Consultor

Este guia mostra um fluxo completo de uso da API, desde a instalação até a sincronização de boletos.

## 🚀 Passo a Passo

### 1. Instalação e Configuração

```bash
# Instalar dependências
npm install

# Executar migrations no banco de dados
# Conecte-se ao Supabase e execute o arquivo migrations/001_initial_schema.sql
```

### 2. Iniciar o Servidor

```bash
# Modo desenvolvimento (com auto-reload)
npm run dev

# Ou modo produção
npm start
```

O servidor iniciará em `http://localhost:3000`

### 3. Criar uma API Key

Use a Master API Key configurada no `.env` para criar uma nova API Key:

```bash
curl -X POST http://localhost:3000/api/auth/keys \
  -H "X-API-Key: master-key-12345-central-consultor" \
  -H "Content-Type: application/json" \
  -d '{
    "descricao": "API Key para testes"
  }'
```

**Resposta:**
```json
{
  "success": true,
  "message": "API Key criada com sucesso",
  "data": {
    "id": "abc123...",
    "key": "ck_a1b2c3d4e5f6g7h8i9j0...",
    "descricao": "API Key para testes",
    "ativo": true,
    "created_at": "2026-02-11T10:00:00.000Z"
  },
  "warning": "Guarde esta chave em local seguro. Ela não será exibida novamente."
}
```

⚠️ **IMPORTANTE:** Copie e guarde a `key` retornada. Você precisará dela para as próximas requisições.

### 4. Cadastrar um Cliente

```bash
curl -X POST http://localhost:3000/api/clientes \
  -H "X-API-Key: ck_a1b2c3d4e5f6g7h8i9j0..." \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Cooperativa ABC",
    "token_bearer": "SEU_TOKEN_DA_API_SGA_AQUI",
    "url_base_api": "https://api.hinova.com.br/api/sga/v2",
    "ativo": true
  }'
```

**Resposta:**
```json
{
  "success": true,
  "message": "Cliente criado com sucesso",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "nome": "Cooperativa ABC",
    "url_base_api": "https://api.hinova.com.br/api/sga/v2",
    "ativo": true,
    "created_at": "2026-02-11T10:05:00.000Z",
    "updated_at": "2026-02-11T10:05:00.000Z"
  }
}
```

Copie o `id` do cliente retornado.

### 5. Cadastrar Consultores

Cadastre os consultores que você deseja monitorar. O `id_consultor_sga` deve corresponder ao `codigo_voluntario` da API SGA.

```bash
# Consultor 1
curl -X POST http://localhost:3000/api/consultores \
  -H "X-API-Key: ck_a1b2c3d4e5f6g7h8i9j0..." \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_id": "550e8400-e29b-41d4-a716-446655440000",
    "nome": "João Silva",
    "id_consultor_sga": "4",
    "contato": "(83) 99999-9999",
    "ativo": true
  }'

# Consultor 2
curl -X POST http://localhost:3000/api/consultores \
  -H "X-API-Key: ck_a1b2c3d4e5f6g7h8i9j0..." \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_id": "550e8400-e29b-41d4-a716-446655440000",
    "nome": "Maria Santos",
    "id_consultor_sga": "7",
    "contato": "(83) 98888-8888",
    "ativo": true
  }'
```

### 6. Configurar Filtros de Situação de Veículo

Por padrão, apenas veículos com situação "ATIVO" são sincronizados. Para aceitar outras situações:

```bash
curl -X POST http://localhost:3000/api/configuracoes \
  -H "X-API-Key: ck_a1b2c3d4e5f6g7h8i9j0..." \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_id": "550e8400-e29b-41d4-a716-446655440000",
    "situacoes_veiculo_aceitas": ["ATIVO", "INADIMPLENTE", "REGULAR"]
  }'
```

### 7. Sincronizar Boletos da API SGA

Agora você pode sincronizar os boletos do período desejado:

```bash
curl -X POST http://localhost:3000/api/boletos/sincronizar \
  -H "X-API-Key: ck_a1b2c3d4e5f6g7h8i9j0..." \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_id": "550e8400-e29b-41d4-a716-446655440000",
    "data_vencimento_inicial": "01/02/2026",
    "data_vencimento_final": "28/02/2026",
    "codigo_situacao_boleto": "2"
  }'
```

**Resposta:**
```json
{
  "success": true,
  "message": "Sincronização concluída",
  "periodo": {
    "data_inicial": "01/02/2026",
    "data_final": "28/02/2026"
  },
  "estatisticas": {
    "total_processados": 1902,
    "total_inseridos": 150,
    "total_atualizados": 0,
    "total_ignorados": 1752,
    "erros": []
  }
}
```

**O que acontece na sincronização:**
1. A API busca todos os boletos do período na API SGA
2. Filtra apenas os veículos com situação aceita (configurada no passo 6)
3. Filtra apenas os boletos dos consultores cadastrados (passo 5)
4. Salva ou atualiza os boletos no banco de dados

### 8. Consultar Boletos Sincronizados

#### Listar todos os boletos do cliente

```bash
curl -X GET "http://localhost:3000/api/boletos?cliente_id=550e8400-e29b-41d4-a716-446655440000&page=1&limit=10" \
  -H "X-API-Key: ck_a1b2c3d4e5f6g7h8i9j0..."
```

#### Listar boletos de um consultor específico

```bash
curl -X GET "http://localhost:3000/api/boletos?cliente_id=550e8400-e29b-41d4-a716-446655440000&consultor_id=uuid-do-consultor&page=1&limit=10" \
  -H "X-API-Key: ck_a1b2c3d4e5f6g7h8i9j0..."
```

#### Filtrar por situação do boleto

```bash
curl -X GET "http://localhost:3000/api/boletos?cliente_id=550e8400-e29b-41d4-a716-446655440000&situacao_boleto=ABERTO&page=1&limit=10" \
  -H "X-API-Key: ck_a1b2c3d4e5f6g7h8i9j0..."
```

#### Filtrar por período de vencimento

```bash
curl -X GET "http://localhost:3000/api/boletos?cliente_id=550e8400-e29b-41d4-a716-446655440000&data_vencimento_inicial=01/02/2026&data_vencimento_final=15/02/2026&page=1&limit=10" \
  -H "X-API-Key: ck_a1b2c3d4e5f6g7h8i9j0..."
```

### 9. Obter Resumo de um Consultor

```bash
curl -X GET "http://localhost:3000/api/boletos/consultor/uuid-do-consultor/resumo?cliente_id=550e8400-e29b-41d4-a716-446655440000" \
  -H "X-API-Key: ck_a1b2c3d4e5f6g7h8i9j0..."
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "consultor_id": "uuid-do-consultor",
    "total_boletos": 75,
    "valor_total": 7125.50,
    "total_abertos": 60,
    "total_vencidos": 10,
    "total_pagos": 5
  }
}
```

## 📋 Comandos Úteis

### Listar todos os clientes

```bash
curl -X GET "http://localhost:3000/api/clientes" \
  -H "X-API-Key: ck_a1b2c3d4e5f6g7h8i9j0..."
```

### Listar consultores de um cliente

```bash
curl -X GET "http://localhost:3000/api/consultores?cliente_id=550e8400-e29b-41d4-a716-446655440000" \
  -H "X-API-Key: ck_a1b2c3d4e5f6g7h8i9j0..."
```

### Verificar configurações de filtro

```bash
curl -X GET "http://localhost:3000/api/configuracoes/550e8400-e29b-41d4-a716-446655440000" \
  -H "X-API-Key: ck_a1b2c3d4e5f6g7h8i9j0..."
```

### Health Check

```bash
curl -X GET "http://localhost:3000/health"
```

## 🔄 Sincronização Automática do Mês Atual

Se você não fornecer as datas, a API usa automaticamente o período do mês atual:

```bash
curl -X POST http://localhost:3000/api/boletos/sincronizar \
  -H "X-API-Key: ck_a1b2c3d4e5f6g7h8i9j0..." \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_id": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

## 🛠️ Gerenciamento de API Keys

### Listar todas as API Keys

```bash
curl -X GET "http://localhost:3000/api/auth/keys" \
  -H "X-API-Key: master-key-12345-central-consultor"
```

### Desativar uma API Key

```bash
curl -X PATCH "http://localhost:3000/api/auth/keys/uuid-da-key/toggle" \
  -H "X-API-Key: master-key-12345-central-consultor"
```

### Deletar uma API Key

```bash
curl -X DELETE "http://localhost:3000/api/auth/keys/uuid-da-key" \
  -H "X-API-Key: master-key-12345-central-consultor"
```

## 📊 Exemplo de Resposta de Listagem de Boletos

```json
{
  "success": true,
  "total": 150,
  "page": 1,
  "limit": 10,
  "total_pages": 15,
  "boletos": [
    {
      "id": "abc-123-def-456",
      "consultor": {
        "id": "consultor-uuid",
        "nome": "João Silva",
        "id_consultor_sga": "4"
      },
      "nosso_numero": "5987645",
      "linha_digitavel": "34191.09685 53801.080937 75008.900005 2 13450000009475",
      "valor_boleto": 94.75,
      "nome_associado": "RONALDO BARBOSA FRANKLIN",
      "cpf_associado": "03644756414",
      "celular": "(83) 9935-16514",
      "data_vencimento": "2026-02-02",
      "situacao_boleto": "ABERTO",
      "modelo_veiculo": "NXR 160 BROS FLEX",
      "placa_veiculo": "TOV1E92",
      "mes_referente": "01/2026",
      "created_at": "2026-02-11T10:30:00.000Z",
      "updated_at": "2026-02-11T10:30:00.000Z"
    }
  ]
}
```

## 🎯 Dicas

1. **Sincronização Periódica**: Configure um cron job ou agendador para executar a sincronização automaticamente todos os dias.

2. **Múltiplos Clientes**: Você pode cadastrar vários clientes e cada um terá seus próprios consultores e boletos isolados.

3. **Paginação**: Use os parâmetros `page` e `limit` para navegar por grandes volumes de boletos.

4. **Filtros Combinados**: Você pode combinar múltiplos filtros na listagem de boletos para consultas mais específicas.

5. **Dados Completos**: O campo `dados_completos` no boleto contém o JSON completo retornado pela API SGA, útil para análises detalhadas.

## ⚠️ Importante

- Sempre guarde suas API Keys em local seguro
- Não compartilhe o token Bearer da API SGA
- Execute as migrations antes de usar a API
- Verifique os logs do servidor para acompanhar as sincronizações
- Em produção, altere a Master API Key padrão

---

**Precisa de ajuda?** Consulte o README.md para mais informações.
