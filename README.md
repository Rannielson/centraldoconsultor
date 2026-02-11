# API Central do Consultor

API REST para gerenciar a integração com a API SGA (Sistema de Gestão de Associados), armazenando e organizando boletos por consultores e clientes.

## 📋 Índice

- [Características](#características)
- [Tecnologias](#tecnologias)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Executando o Projeto](#executando-o-projeto)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Documentação da API](#documentação-da-api)
- [Fluxo de Uso](#fluxo-de-uso)
- [Exemplos de Requisições](#exemplos-de-requisições)

## ✨ Características

- 🔐 Autenticação via API Key
- 📊 Sincronização automática de boletos da API SGA
- 🔍 Filtragem inteligente por situação de veículo e consultor
- 📈 Paginação e consultas otimizadas
- 🗄️ Armazenamento em PostgreSQL (Supabase)
- ⚡ Alta performance com Fastify
- 🛡️ Validação de dados com JSON Schema
- 📝 Logs estruturados

## 🚀 Tecnologias

- **Node.js** - Runtime JavaScript
- **Fastify** - Framework web de alta performance
- **PostgreSQL** - Banco de dados relacional
- **Supabase** - Plataforma de banco de dados
- **Axios** - Cliente HTTP para integração com API SGA
- **dotenv** - Gerenciamento de variáveis de ambiente

## 📦 Instalação

### Pré-requisitos

- Node.js 18+ instalado
- Acesso ao banco de dados Supabase (já configurado)
- Token de acesso à API SGA

### Passos

1. Clone o repositório (ou navegue até a pasta do projeto):

```bash
cd apiCentraldoConsultor
```

2. Instale as dependências:

```bash
npm install
```

## ⚙️ Configuração

1. Configure as variáveis de ambiente no arquivo `.env`:

```env
# Banco de Dados
DATABASE_URL=postgresql://postgres:rNUGuYJ1JHLr7gyp@db.tyyqrygkpoibslqegvow.supabase.co:5432/postgres

# Servidor
PORT=3000
NODE_ENV=development

# API Key Master (para criar outras keys)
MASTER_API_KEY=master-key-12345-central-consultor
```

2. Execute as migrations do banco de dados:

Conecte-se ao Supabase e execute o script SQL em `migrations/001_initial_schema.sql`

Ou use um cliente PostgreSQL:

```bash
psql "postgresql://postgres:rNUGuYJ1JHLr7gyp@db.tyyqrygkpoibslqegvow.supabase.co:5432/postgres" -f migrations/001_initial_schema.sql
```

## 🏃 Executando o Projeto

### Modo Desenvolvimento (com auto-reload)

```bash
npm run dev
```

### Modo Produção

```bash
npm start
```

O servidor iniciará em `http://localhost:3000`

## 📁 Estrutura do Projeto

```
apiCentraldoConsultor/
├── src/
│   ├── config/
│   │   └── database.js          # Configuração do banco de dados
│   ├── middlewares/
│   │   └── auth.js               # Middleware de autenticação
│   ├── routes/
│   │   ├── clientes.js           # Rotas de clientes
│   │   ├── consultores.js        # Rotas de consultores
│   │   ├── configuracoes.js      # Rotas de configurações
│   │   ├── boletos.js            # Rotas de boletos
│   │   └── apikeys.js            # Rotas de API Keys
│   ├── services/
│   │   ├── sgaService.js         # Integração com API SGA
│   │   └── boletoService.js      # Lógica de negócio de boletos
│   └── server.js                 # Entry point da aplicação
├── migrations/
│   └── 001_initial_schema.sql    # Schema inicial do banco
├── package.json
├── .env
├── .env.example
└── README.md
```

## 📚 Documentação da API

### Autenticação

Todas as rotas (exceto `/` e `/health`) requerem autenticação via API Key no header:

```
X-API-Key: sua-api-key-aqui
```

Rotas de gerenciamento de API Keys requerem a **Master API Key** configurada no `.env`.

### Endpoints Disponíveis

#### 🏥 Health Check

- `GET /` - Status da API
- `GET /health` - Health check detalhado

#### 👥 Clientes

- `POST /api/clientes` - Criar cliente
- `GET /api/clientes` - Listar clientes
- `GET /api/clientes/:id` - Buscar cliente por ID
- `PUT /api/clientes/:id` - Atualizar cliente
- `DELETE /api/clientes/:id` - Deletar cliente

#### 👤 Consultores

- `POST /api/consultores` - Criar consultor
- `GET /api/consultores` - Listar consultores (filtro opcional: `?cliente_id=uuid`)
- `GET /api/consultores/:id` - Buscar consultor por ID
- `PUT /api/consultores/:id` - Atualizar consultor
- `DELETE /api/consultores/:id` - Deletar consultor

#### ⚙️ Configurações de Filtro

- `POST /api/configuracoes` - Criar/atualizar configuração
- `GET /api/configuracoes` - Listar todas as configurações
- `GET /api/configuracoes/:cliente_id` - Buscar configuração por cliente
- `DELETE /api/configuracoes/:cliente_id` - Deletar configuração

#### 📄 Boletos

- `POST /api/boletos/sincronizar` - Sincronizar boletos da API SGA
- `GET /api/boletos` - Listar boletos (requer `?cliente_id=uuid`)
- `GET /api/boletos/:id` - Buscar boleto por ID
- `GET /api/boletos/consultor/:consultor_id/resumo` - Resumo de boletos do consultor

#### 🔑 API Keys (requer Master API Key)

- `POST /api/auth/keys` - Criar nova API Key
- `GET /api/auth/keys` - Listar API Keys
- `GET /api/auth/keys/:id` - Buscar API Key por ID
- `PUT /api/auth/keys/:id` - Atualizar descrição
- `PATCH /api/auth/keys/:id/toggle` - Ativar/desativar
- `DELETE /api/auth/keys/:id` - Deletar API Key

## 🔄 Fluxo de Uso

### 1. Criar API Key

Primeiro, crie uma API Key para usar nos demais endpoints:

```bash
curl -X POST http://localhost:3000/api/auth/keys \
  -H "X-API-Key: master-key-12345-central-consultor" \
  -H "Content-Type: application/json" \
  -d '{"descricao": "Minha API Key"}'
```

Guarde a `key` retornada para usar nas próximas requisições.

### 2. Cadastrar Cliente

```bash
curl -X POST http://localhost:3000/api/clientes \
  -H "X-API-Key: sua-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Cooperativa XYZ",
    "token_bearer": "token-da-api-sga",
    "url_base_api": "https://api.hinova.com.br/api/sga/v2"
  }'
```

### 3. Cadastrar Consultores

```bash
curl -X POST http://localhost:3000/api/consultores \
  -H "X-API-Key: sua-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_id": "uuid-do-cliente",
    "nome": "João Silva",
    "id_consultor_sga": "4",
    "contato": "(83) 99999-9999"
  }'
```

### 4. Configurar Filtros (Opcional)

```bash
curl -X POST http://localhost:3000/api/configuracoes \
  -H "X-API-Key: sua-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_id": "uuid-do-cliente",
    "situacoes_veiculo_aceitas": ["ATIVO", "INADIMPLENTE", "REGULAR"]
  }'
```

### 5. Sincronizar Boletos

```bash
curl -X POST http://localhost:3000/api/boletos/sincronizar \
  -H "X-API-Key: sua-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_id": "uuid-do-cliente",
    "data_vencimento_inicial": "01/02/2026",
    "data_vencimento_final": "28/02/2026",
    "codigo_situacao_boleto": "2"
  }'
```

### 6. Consultar Boletos

```bash
curl -X GET "http://localhost:3000/api/boletos?cliente_id=uuid-do-cliente&page=1&limit=50" \
  -H "X-API-Key: sua-api-key"
```

## 📝 Exemplos de Requisições

### Criar Cliente

**Request:**
```json
POST /api/clientes
{
  "nome": "Cooperativa ABC",
  "token_bearer": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "url_base_api": "https://api.hinova.com.br/api/sga/v2",
  "ativo": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cliente criado com sucesso",
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "nome": "Cooperativa ABC",
    "url_base_api": "https://api.hinova.com.br/api/sga/v2",
    "ativo": true,
    "created_at": "2026-02-11T10:00:00.000Z",
    "updated_at": "2026-02-11T10:00:00.000Z"
  }
}
```

### Sincronizar Boletos

**Request:**
```json
POST /api/boletos/sincronizar
{
  "cliente_id": "123e4567-e89b-12d3-a456-426614174000",
  "data_vencimento_inicial": "01/02/2026",
  "data_vencimento_final": "28/02/2026",
  "codigo_situacao_boleto": "2"
}
```

**Response:**
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
    "total_atualizados": 50,
    "total_ignorados": 1702,
    "erros": []
  }
}
```

### Listar Boletos

**Request:**
```
GET /api/boletos?cliente_id=123e4567-e89b-12d3-a456-426614174000&page=1&limit=10
```

**Response:**
```json
{
  "success": true,
  "total": 200,
  "page": 1,
  "limit": 10,
  "total_pages": 20,
  "boletos": [
    {
      "id": "uuid",
      "consultor": {
        "id": "uuid",
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
      "created_at": "2026-02-11T10:00:00.000Z",
      "updated_at": "2026-02-11T10:00:00.000Z"
    }
  ]
}
```

## 🔍 Filtros e Paginação

### Listar Boletos com Filtros

```
GET /api/boletos?cliente_id=uuid&consultor_id=uuid&situacao_boleto=ABERTO&data_vencimento_inicial=01/02/2026&data_vencimento_final=28/02/2026&page=1&limit=50
```

**Parâmetros:**
- `cliente_id` (obrigatório) - UUID do cliente
- `consultor_id` (opcional) - UUID do consultor
- `situacao_boleto` (opcional) - Situação do boleto (ABERTO, VENCIDO, PAGO, etc.)
- `data_vencimento_inicial` (opcional) - Data inicial (DD/MM/YYYY)
- `data_vencimento_final` (opcional) - Data final (DD/MM/YYYY)
- `page` (opcional, padrão: 1) - Página atual
- `limit` (opcional, padrão: 50) - Registros por página

## 🛡️ Segurança

- ✅ Autenticação obrigatória via API Key
- ✅ Master API Key separada para gerenciamento de keys
- ✅ Validação de dados com JSON Schema
- ✅ Proteção contra SQL Injection (queries parametrizadas)
- ✅ CORS configurável
- ✅ Logs de segurança

## 📊 Monitoramento

### Health Check

```bash
curl http://localhost:3000/health
```

Retorna o status da API e da conexão com o banco de dados.

## 🐛 Troubleshooting

### Erro de conexão com banco de dados

Verifique se:
1. A URL do banco está correta no `.env`
2. O banco de dados está acessível
3. As migrations foram executadas

### Erro de autenticação na API SGA

Verifique se:
1. O `token_bearer` do cliente está correto e válido
2. A URL base da API SGA está correta
3. O token não expirou

### Nenhum boleto sincronizado

Verifique se:
1. Os consultores estão cadastrados com os `id_consultor_sga` corretos
2. As configurações de filtro estão corretas
3. O período de datas contém boletos na API SGA

## 📄 Licença

Este projeto é proprietário e confidencial.

## 👨‍💻 Suporte

Para dúvidas ou problemas, entre em contato com a equipe de desenvolvimento.

---

**API Central do Consultor** - Versão 1.0.0
