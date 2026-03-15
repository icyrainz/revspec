# Auth System Design

## Overview

Users authenticate via **OAuth2** with `Google` and *GitHub* providers.

## Endpoints

- POST /auth/login — initiates OAuth flow
- GET /auth/callback — handles provider callback
- POST /auth/refresh — refreshes ~~expired~~ tokens

## Token Storage

Tokens are stored in Redis as JSON blobs. See [Redis docs](https://redis.io).

| Key | Format | TTL |
|---|---|---|
| `session:{id}` | JSON blob | 24h |

## Tasks

- [x] Implement login
- [ ] Add rate limiting

> Note: tokens are **not encrypted** at rest.

### Code Example

```typescript
const token: string = await auth.login();
```

---

End of spec.
