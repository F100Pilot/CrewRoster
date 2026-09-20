# TODO — CrewRoster

Funcionalidades pendentes ou adiadas. O backlog que depende de dados que ainda não
temos (limites da PGA, taxas de ajudas de custo, base de dados de pistas) vive em
`../EXPERIMENTAL.md`, para não haver duas listas a dizer o mesmo.

_Última verificação contra o código: 2026-09-20 (v0.8.16)._

---

## Em espera (trabalho iniciado, suspenso)

### Sincronização Google Calendar
`src/components/GoogleCalendarSync.tsx` e `src/utils/googleCalendar.ts` estão escritos
mas **o componente não está ligado a nenhuma página** — a exportação para calendário que
o utilizador vê hoje é a do ficheiro `.ics`.

O que falta para retomar:
- Testar o fluxo OAuth completo num dispositivo real (Chrome, Android).
- Confirmar que o `Client ID` gerado pelo utilizador no Google Cloud Console aceita a
  origem do GitHub Pages (`https://f100pilot.github.io`).
- Voltar a expor o botão nas Definições.
- Feedback de progresso evento a evento.

---

## Novas funcionalidades

### Notificações push de alterações de escala
Quando a escala muda no portal CrewLink, a app devia avisar sem o utilizador ter de
abrir o portal. Requer Service Worker com Background Sync e um endpoint servidor-side
(ou o Cloudflare Worker com um Cron Trigger a fazer polling). Nada disto existe ainda.

### Alertas de validade de documentos
A página Documentos já mostra os dias que faltam com cor (verde/laranja/vermelho), mas
é preciso lá ir para ver. Falta o aviso ativo: um cartão na página principal para o que
expira nos próximos ~60 dias e/ou notificação local (Notification API).

### Histórico de escalas
Só se guarda a escala atual (`rosters` tem uma entrada por utilizador); os PDFs de
origem esses ficam todos. Guardar as últimas N escalas permitiria comparar meses
diferentes ou restaurar uma versão anterior.

### Tema de cores personalizável
A cor de acento é fixa (azul PGA). Deixar escolher outra cor primária (localStorage).

### Suporte a outros operadores / layouts de PDF
O `pgaGrid.ts` está calibrado para a Portugália (NetLine). **Adiado por decisão**
(setembro 2026): o caminho genérico por ICS/CSV já serve qualquer companhia. Se algum
dia se avançar, o ponto de extensão é `src/parsing/pdf/profiles/` e o maior bloco a
extrair é a tabela de códigos do `classifyDuty()`.

---

## Melhorias conhecidas / refinamentos

- **Estatísticas — evolução mensal**: existe o total por ano e o heatmap de atividade;
  falta um gráfico de barras com as horas de bloco mês a mês.
- **Parser — dias com vários voos**: o caso do número de voo de 4 dígitos que colide com
  uma hora (`TP1452` vs `14:52`) está resolvido e com testes de regressão
  (`pgaGridFlightTime.test.ts`), mas continua a ser a zona do parser mais sensível a
  layouts novos — testar sempre que aparecer uma escala com formato diferente.
