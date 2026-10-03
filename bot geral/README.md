# Frio Bot

Bot Discord completo para servidores de Free Fire, apostas, tickets, loja, streamers e automações.
Versão **v6.8.0** (não foi alterado nesta atualização — apenas integração de token com o painel).

---

## Requisitos

- **Node.js 22.x**
- **npm 10+**
- Conta no **Supabase** (mesmo banco do painel)
- Bot no **Discord Developer Portal**
- (Opcional) **Mercado Pago** para pagamentos automáticos
- (Opcional) **Render API** para métricas

---

## Instalação

```bash
git clone https://github.com/seu-usuario/frio-bot.git
cd frio-bot
npm install
cp .env.example .env
# edite o .env
npm start
```

---

## Configuração (.env)

```env
# Discord
DISCORD_TOKEN=seu-bot-token
DISCORD_CLIENT_ID=123456789012345678
DISCORD_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxx
OWNER_ID=seu-id
REDIRECT_URI=https://frio-bot.onrender.com/callback

# Supabase (mesmo banco do painel)
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_KEY=service_role_key

# Integração com o painel
PANEL_API_TOKEN=<MESMO TOKEN DO PAINEL>
JWT_SECRET=<secret aleatório>
PANEL_URL=https://painel.seudominio.com

# Portas
PORT=3000
WEBHOOK_PORT=3000

# Mercado Pago (opcional)
MP_ACCESS_TOKEN=APP_USR-xxxx
MP_WEBHOOK_URL=https://frio-bot.onrender.com/api/mp/webhook

# Render API (opcional)
RENDER_API_KEY=rnd_xxxx

# Verificação
VERIFY_SECRET=<secret aleatório>
```

---

## ⚠️ Importante

**O `PANEL_API_TOKEN` deve ser idêntico ao do painel.**
Sem isso, o bot rejeita todas as chamadas do painel com HTTP 401.

---

## Execução

```bash
npm start          # produção
node teste.js      # testes
node teste-ws.js   # teste de websocket/gateway
```

---

## Health check

```bash
curl http://localhost:3000/health
```

---

## Integração com o Painel

O bot expõe uma API interna em `/api/bot/*` protegida por Bearer token:

- `GET /api/bot/health` — status
- `POST /api/bot/audit/log` — recebe logs do painel
- `POST /api/bot/guilds/sync` — sincroniza servidores
- `POST /api/bot/kill-switch` — ativa/desativa globalmente
- `POST /api/bot/maintenance` — manutenção global
- `POST /api/bot/force-premium` — aplica premium
- `POST /api/bot/broadcast` — envia aviso para todos
- `POST /api/bot/guild/:id/leave` — sai do servidor
- `POST /api/bot/guild/:id/rename` — renomeia
- `POST /api/bot/guild/:id/nuke` — apaga canais/cargos
- `POST /api/bot/guild/:id/refresh` — atualiza dados
- `GET /api/bot/guild/:id/stats` — estatísticas
- `POST /api/bot/notify/:userId` — manda DM

Todas exigem `Authorization: Bearer $PANEL_API_TOKEN`.

---

## Estrutura

- `index.js` — arquivo principal (12 partes, ~9k linhas)
- `emojis.js` — emojis customizados
- `package.json` — dependências

---

## Licença

MIT
