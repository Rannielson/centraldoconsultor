# n8n Integration Guide - PDF Template Engine

Complete guide for integrating the PDF Template Engine with n8n workflows.

## 🎯 Overview

This service allows you to generate dynamic PDFs from n8n workflows using HTTP Request nodes. Perfect for automated reports, invoices, certificates, and more.

## 🔑 Step 1: Create API Key

Before using the service in n8n, create an API key:

```bash
curl -X POST http://localhost:3000/v1/auth/api-keys \
  -H "Content-Type: application/json" \
  -d '{
    "name": "n8n-production",
    "scopes": ["templates:read", "templates:write", "pdf:render", "pdf:read"]
  }'
```

**Save the `apiKey` value - it's only shown once!**

## 📝 Step 2: Create a Template

Create a template that defines your PDF structure:

```bash
curl -X POST http://localhost:3000/v1/templates \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "monthly-report",
    "name": "Monthly Sales Report",
    "paperSize": "A4",
    "orientation": "portrait",
    "columnsCount": 4,
    "columnsDefinition": {
      "0": {"label": "Produto", "type": "text"},
      "1": {"label": "Quantidade", "type": "number"},
      "2": {"label": "Preço Unit.", "type": "currency"},
      "3": {"label": "Total", "type": "currency"}
    }
  }'
```

## 🤖 Step 3: n8n Workflow Setup

### Basic Workflow Structure

```
[Trigger] → [Prepare Data] → [Generate PDF] → [Check Status] → [Send Email/Save]
```

### Node 1: HTTP Request - Generate PDF

**Configuration:**

- **Method:** `POST`
- **URL:** `http://localhost:3000/v1/pdfs/render`
- **Authentication:** None (we'll use headers)
- **Send Headers:** Yes

**Headers:**
```json
{
  "Authorization": "Bearer YOUR_API_KEY_HERE",
  "Content-Type": "application/json"
}
```

**Body (JSON):**
```json
{
  "templateId": "monthly-report",
  "content": {
    "title": "{{ $json.reportTitle }}",
    "subtitle": "{{ $json.period }}",
    "items": {{ $json.salesData }}
  }
}
```

**Expected Output:**
```json
{
  "documentId": "uuid-here",
  "status": "PROCESSING"
}
```

### Node 2: Wait (Optional)

Add a **Wait** node for 5 seconds to allow PDF processing to complete.

### Node 3: HTTP Request - Check PDF Status

**Configuration:**

- **Method:** `GET`
- **URL:** `http://localhost:3000/v1/pdfs/{{ $json.documentId }}`
- **Headers:** Same as Node 1

**Expected Output:**
```json
{
  "status": "DONE",
  "pdfUrl": "/pdfs/uuid.pdf"
}
```

### Node 4: Get PDF File

**Method:** `GET`
**URL:** `http://localhost:3000{{ $json.pdfUrl }}`

This downloads the PDF file as binary data.

## 📊 Complete Example: Sales Report Automation

### Scenario
Generate a monthly sales report PDF and email it automatically.

### n8n JSON Workflow

```json
{
  "nodes": [
    {
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "parameters": {
        "rule": {
          "interval": [{"field": "month"}]
        }
      }
    },
    {
      "name": "Prepare Data",
      "type": "n8n-nodes-base.set",
      "parameters": {
        "values": {
          "string": [
            {"name": "reportTitle", "value": "Relatório de Vendas"},
            {"name": "period", "value": "={{ $now.format('MMMM/yyyy') }}"}
          ],
          "array": [{
            "name": "salesData",
            "value": [
              {"0": "Produto A", "1": "150", "2": "R$ 50,00", "3": "R$ 7.500,00"},
              {"0": "Produto B", "1": "200", "2": "R$ 30,00", "3": "R$ 6.000,00"}
            ]
          }]
        }
      }
    },
    {
      "name": "Generate PDF",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "http://localhost:3000/v1/pdfs/render",
        "options": {
          "headers": {
            "Authorization": "Bearer sk_live_xxx",
            "Content-Type": "application/json"
          }
        },
        "bodyParametersJson": {
          "templateId": "monthly-report",
          "content": {
            "title": "={{ $json.reportTitle }}",
            "subtitle": "={{ $json.period }}",
            "items": "={{ $json.salesData }}"
          }
        }
      }
    },
    {
      "name": "Wait 5s",
      "type": "n8n-nodes-base.wait",
      "parameters": {
        "amount": 5
      }
    },
    {
      "name": "Get PDF Status",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "GET",
        "url": "=http://localhost:3000/v1/pdfs/{{ $json.documentId }}",
        "options": {
          "headers": {
            "Authorization": "Bearer sk_live_xxx"
          }
        }
      }
    },
    {
      "name": "Download PDF",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "GET",
        "url": "=http://localhost:3000{{ $json.pdfUrl }}",
        "options": {
          "response": {
            "responseFormat": "file"
          }
        }
      }
    },
    {
      "name": "Send Email",
      "type": "n8n-nodes-base.gmail",
      "parameters": {
        "resource": "message",
        "operation": "send",
        "to": "cliente@exemplo.com",
        "subject": "Seu Relatório Mensal",
        "message": "Segue anexo o relatório de vendas.",
        "attachments": "={{$binary}}"
      }
    }
  ]
}
```

## 🎨 Template Examples

### Invoice Template

```json
{
  "id": "invoice-v1",
  "name": "Invoice",
  "columnsCount": 4,
  "columnsDefinition": {
    "0": {"label": "Description", "type": "text"},
    "1": {"label": "Quantity", "type": "number"},
    "2": {"label": "Unit Price", "type": "currency"},
    "3": {"label": "Total", "type": "currency"}
  }
}
```

### Performance Metrics

```json
{
  "id": "kpi-dashboard",
  "name": "KPI Dashboard",
  "columnsCount": 3,
  "columnsDefinition": {
    "0": {"label": "Metric", "type": "text"},
    "1": {"label": "Current", "type": "number"},
    "2": {"label": "Target", "type": "number"}
  }
}
```

## 🔍 Troubleshooting

### PDF Status is "ERROR"

Check the error message:
```bash
GET /v1/pdfs/:id
```

Response will include `errorMsg` field.

### Authentication Failed

- Verify your API key is correct
- Check that the key has the required scope (`pdf:render`)
- Ensure `Authorization: Bearer` header is properly formatted

### Template Not Found

- Verify the `templateId` exists
- Use `GET /v1/templates` to list all templates

## 🚀 Production Tips

1. **Error Handling:** Add an IF node to check if `status === "DONE"` before proceeding
2. **Retry Logic:** Use n8n's retry option for failed requests
3. **Webhooks:** For long-running PDFs, consider webhook callbacks (future feature)
4. **Caching:** Cache template IDs in n8n credentials or environment variables

## 📈 Performance

- **Average PDF Generation:** 3-5 seconds
- **Concurrent Requests:** Limited by system resources
- **Recommended:** Use queues for batch processing

## 🔒 Security Best Practices

- Store API keys in n8n credentials (not hardcoded)
- Use HTTPS in production
- Rotate API keys periodically
- Limit scopes to minimum required permissions
