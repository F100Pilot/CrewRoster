# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.9.0`
- **Próxima versão ao promover:** `0.9.1` (ou superior, conforme o âmbito)

## Como promover tudo para produção (quando estiver pronto)

1. Na branch `claude/crew-per-flight`: subir `APP_VERSION` em
   `roster-lite/src/version.ts` e adicionar a entrada em `RELEASE_NOTES`
   (resumindo os itens abaixo).
2. `git checkout master && git merge --no-ff claude/crew-per-flight`.
3. `git push origin master` → o workflow publica a produção (e, se `worker.js`
   mudou, o `deploy-worker.yml` republica o worker Cloudflare).
4. **Esvaziar a secção "Pendente" deste ficheiro** (passou tudo para as notas de
   versão).

---

## Pendente para a próxima versão

- **0.9.1 — partilha do mês e Google Calendar.** Menu "Partilhar o mês" no Calendário (`ShareMonthMenu.tsx`):
  imagem, texto dia a dia (`utils/shareMonth.ts`, horas locais, sem tripulantes/valores) e `.ics` só do mês.
  Google Calendar (`services/googleCalendar.ts`): Google Identity Services (token em memória), scope
  `calendar.app.created`, calendário próprio "CrewRoster", sincronização insere/atualiza/apaga pelos ids
  derivados de `RosterEvent.key` (modelo comum ao `.ics` em `icsExport.ts`). **Precisa do secret
  `VITE_GOOGLE_CLIENT_ID`** (cliente OAuth "Web application", origem `https://f100pilot.github.io`); sem ele o
  botão não aparece. A CSP só abre accounts.google.com / www.googleapis.com nesses builds.
  Datas com tamanho normal (tirado o `fontSize: 0.8rem`).
- **0.9.1.1** — a imagem do mês (`renderMonthCard` em `shareDay.ts`) passa a ser o calendário completo: dias-tecla
  com a cor do serviço, destino + hora local de saída, resumo do mês e legenda (antes só listava rotas).
- **0.9.2 — IO / prevenir** (bug de um colega): o parser lê `IO` (Other, com horas; PARSE_VERSION 17);
  `mergeDuties` guarda no IO a apresentação do serviço que substituiu (`planned`); `domain/irregularity.ts`:
  prevenir = IO que começa à apresentação planeada, ou marcado no dia (`crewroster.prevenir.<user>`,
  aplicado no RosterProvider). Prevenir → abonos RAACO do período (Tabela 33, caso C07), ajuda de custo A
  nacional sem isenção (recibo: "Per diem A PGA CTE T"), duty. IO normal: conta o PSV da escala (confirmado);
  **em aberto:** se paga ajuda de custo / abonos.
- **0.9.2.1** — o botão "Foi o prevenir" só aparece quando não há escala anterior para comparar; com ela, a app
  decide e mostra o motivo (Prevenir / IO normal).
- **0.9.2.2** — IO normal entra no PSV do dia para os abonos (caso C08, MAN). Em aberto: ajuda de custo de um IO
  normal sozinho na base; código APT. Também: chaves `crewroster.gcal*` fora das cópias de segurança.

---

## TODO / Backlog (decidir mais tarde)

- **Duty vs DT da escala (perguntas em aberto ao utilizador):** a escala soma 30 min depois de um DHC que fecha o dia
  (a app segue o AE cl. 17: acaba à chegada) e conta a hora de almoço nos dias GAB (8:00 vs 7:00 na app). Mudar só se
  o recibo mostrar que contam para o vencimento.

- **iPhone (em produção desde 0.8.40, via 0.8.39):** só testado num iPhone simulado (Chromium). Falta um colega com
  iPhone confirmar no Safari: barras fora do notch / barra de gestos, folha de partilha ao exportar, importação de PDF.

- **Line checks (W_INS, em produção desde 0.8.36.1):** confirmar com um PDF real que o código do dia W_PNT é lido
  sem baralhar o dia (só o W_INS foi testado, sobre o fixture com LIFUS_INS) e que o recibo paga um por dia.

- **Vencimento (em produção desde 0.8.34):** isenção por dia (IRS 36,33 / 116,95, SS 51,90 / 175,42 — SS nacional
  corrigido pelo utilizador em 0.8.35.1). Por confirmar: regra do "Subs. gabinete" (maio: 5 pagos para 7 dias GAB); line checks pela marca
  W_INS (0.8.36.1); abonos estimados vs recibo (jun 697/873, ago 130/62).

- **Abonos RAACO (em produção, experimental):** conferido com maio 2026 (711 € vs 768 €). Por explicar: almoço
  de 39 € num DH LIS→FRA com apresentação 8 min depois do horário (atraso? hora planeada?) e almoço de 18 € num
  RAK→LIS de 1h37 (bloco planeado ≤ 1h30?). Marrocos não está na Tabela 34; falta a nota "Pernoita*". Casos
  em aberto e resolvidos: `roster-lite/docs/ABONOS-CASOS.md`.

- **Do AE SIPLA, ainda por fazer**: estimador de per diem (RRRGS cl. 9, tabela A2.2 —
  aguarda valores confirmados / AE atualizado), créditos de duty-pay/block-pay vs plafonds
  (RRRGS cl. 2/12), mínimo anual de 111 folgas, regime alternativo de 11 dias.
- **Lembretes locais (notificações da PWA)** para check-in e documentos a expirar.
- **Componente de vento cruzado** por pista. _A BD de pistas deixou de ser um bloqueio:
  a `runways.csv` do OurAirports é domínio público e bastam os ~40 aeroportos da rede,
  num JSON pequeno carregado em lazy como o `airportCoordsFallback.json`._

---

_Última atualização: 2026-11-12._
