# BACK BOT — v1.1.0 (BACK E-ESPORTES 🐦‍⬛)

## Marca
- Org: **BACK E-ESPORTES** · Bot: **BACK BOT** · Emoji: **🐦‍⬛** (canais, embeds, footers, presença, cargo de membro).
- O bot tenta renomear o próprio usuário para "BACK BOT" ao iniciar (limite do Discord: ~2 trocas/hora).
- Cargo dev agora é "Dev do Back Bot" (o antigo "Dev do Mate Bot" é renomeado sozinho).

## Setup (.govdev e .VK agora são o mesmo setup completo)
- **Cargos**: eram criados de baixo pra cima, e o Discord põe cargo novo embaixo, então a hierarquia saía invertida. Agora são criados na ordem certa e a ordem é verificada/corrigida (até 3 tentativas).
- **Embeds**: o .VK não enviava nenhum. Agora os dois enviam TUDO (ticket, filas, PIX, blacklist, streamer, loja, 11 formatos × 12 valores de aposta e um embed informativo por canal), com retry e relatório de falhas.
- **Canais**: ticket movido para Atendimento (antes ficava na categoria privada Staff e ninguém abria ticket); `fila-streamer` movido para Streamers; `pix-gratis` movido para Eventos; `feedbacks` agora aceita mensagens; canais de aposta ficam só-leitura (botões funcionam); nomes duplicados (divulgação) não se sobrescrevem mais; `log-suporte` do .VK virou `log-ticket`.
- Resultado do setup é enviado na DM de quem rodou e no log-config (o canal do comando é apagado pelo próprio setup).
- Limpa painéis de ticket/apostas de setups anteriores e atualiza os cargos da loja de coins para os novos.

## Tickets
- Ao fechar (manual, auto-close, autor saiu) ou excluir: gera transcript (.html + .txt) e envia no canal de log **e na DM de quem abriu o ticket**. Se a DM estiver fechada, a staff é avisada no log.
