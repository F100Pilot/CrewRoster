# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.9.3.29`
- **Próxima versão ao promover:** a da experimental (cada atualização sobe a 4.ª casa)

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

- **0.9.3.31** — A apresentação fica **sempre 1 h antes** (utilizador: "mais tarde tratamos dos casos especiais"): a
  0.9.3.30 (apresentação pelo [DT] e escrita à mão) foi retirada; PARSE_VERSION 27 relê a escala de quem a abriu.
- **0.9.3.32** — **Escala original importada depois** (colega FO, outubro: a app só tinha as horas voadas, e os blocos
  voados de 1h23 / 1h29 davam almoço pago a 14 e 15/10): a data de impressão do PDF (`pgaPrintedAt`, `ParseResult` /
  `Roster.printedAt`) é a referência do merge; um PDF mais antigo empresta o plano aos dias já voados e nunca substitui
  um dia que a app já tem; a releitura ordena os PDFs pela data de impressão.
- **0.9.3.33** — **Aviso nos abonos sem escala original** (utilizador): setor voado sem plano visto (`planKnown`, gravado
  no merge; PARSE_VERSION 28) → `RaacoDay.noPlan`: alerta + ⚠ na página Abonos e alerta no cartão do dia.
- **0.9.3.34** — **Refeições a bordo marcadas pela tripulação** (utilizador): 🍽 no calendário só nos dias voados com
  refeições em jogo (embarcadas ou pagas; nunca a ceia, DHC ou estadia); cartão "Refeições a bordo" + janela por dia e
  a mesma lista no cartão do dia; "Havia a bordo" → 0, "Não havia" → Tabela 33 (4.5.11.5/6). `components/MealConfirm.tsx`,
  `crewroster.mealOnboard.<user>`, `MealLine.askable` / `crew`.
- **0.9.3.35** — EBT: **mostra o serviço contado** (briefing + sessão + 1 h, `ebtDutyMinutes`) no dia, na Lista e em
  "Hoje" — um utilizador somava as células (debriefing 30 min) e lia 30 min a menos. A conta já estava certa desde 0.9.3.25.
- **0.9.3.36** — Refeições: **interruptor por refeição** no cartão do dia (ligado = a bordo por defeito quando previsto;
  desligar = paga) e na janela do calendário ("Está certo"); **ícones das refeições a bordo** nos cartões da Lista
  (`MealIcon.tsx`, legenda nos Códigos). "Folga e repouso" com **interruptores** (desligar sobre a marca da escala:
  `offDayPay: 'none'`, `restCutMin: -1`). Chip da turbulência legível (cor no `background`, não no `bgcolor`).
- **0.9.3.37** — **Agradecimento aos colegas** (utilizador): primeiro ponto das Novidades desta edição + secção fixa
  "Agradecimentos" em Definições → Ajuda. Sem nomes.

---

## TODO / Backlog (decidir mais tarde)


- **Google Calendar (0.9.1) está no código mas escondido** até existir o secret `VITE_GOOGLE_CLIENT_ID` (cliente
  OAuth "Web application", origem `https://f100pilot.github.io`, Calendar API ativa, âmbito
  `calendar.app.created`). Com o secret, o próximo deploy mostra o botão — juntar então uma nota de versão.
- **IO:** ajuda de custo de um IO normal sozinho na base.

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
  RAK→LIS de 1h37 (bloco planeado ≤ 1h30?). Marrocos não está na Tabela 34 (confirmado no Anexo 7.6, como a nota "Pernoita*"). Outubro e setembro de
  colegas conferidos com extrato, em aberto (horas planeadas, voos especiais, prática da empresa). Casos
  em aberto e resolvidos: `roster-lite/docs/ABONOS-CASOS.md`.

- **Do AE SIPLA, ainda por fazer**: estimador de per diem (RRRGS cl. 9, tabela A2.2 —
  aguarda valores confirmados / AE atualizado), créditos de duty-pay/block-pay vs plafonds
  (RRRGS cl. 2/12), mínimo anual de 111 folgas, regime alternativo de 11 dias.
- **Lembretes locais (notificações da PWA)** para check-in e documentos a expirar.
- **Componente de vento cruzado** por pista. _A BD de pistas deixou de ser um bloqueio:
  a `runways.csv` do OurAirports é domínio público e bastam os ~40 aeroportos da rede,
  num JSON pequeno carregado em lazy como o `airportCoordsFallback.json`._

---

_Última atualização: 2026-11-14._
