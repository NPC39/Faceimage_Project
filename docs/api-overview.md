# API Specifications Overview

## Base URL
- Local Development Backend: `http://localhost:8000`
- API Version Prefix: `/api/v1`

## Endpoints Summary

### System Health
| Method | Endpoint | Description | Status Code |
| ------ | -------- | ----------- | ----------- |
| `GET` | `/health` | Primary health status check | `200 OK` |
| `GET` | `/api/v1/health` | Versioned health status check | `200 OK` |
| `GET` | `/` | Root service metadata | `200 OK` |

### Sample Response (`GET /health`)
```json
{
  "status": "ok",
  "service": "photo-marketplace-backend",
  "version": "0.1.0",
  "timestamp": "2026-08-11T20:30:00.000000"
}
```
