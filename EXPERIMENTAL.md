# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.9.3.10`
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

- **0.9.3.11** — escala real de novembro (dia 23): `CLTC` / `CTRI` ao lado do voo (token "LOGIN CLTC") = line training dado
  (`isInstructorFlight`, MARK_LABEL); `FO_SAFETY` (sub-coluna antes do voo) vai para os voos com 2 FO
  (`placeSafetyMarks`); a tripulação de um voo sem entrada passa a vir do voo ANTERIOR (antes vinha de um voo
  seguinte do mesmo dia — o regresso AGP→LIS levava o formando); piloto sem posto entre o PU e o cockpit = FO.
  PARSE_VERSION 19. Verificado com o PDF real (não guardado).
- **0.9.3.12** — regra do utilizador: a tripulação não é obrigatoriamente a do voo anterior; o FO ao lado do
  `CLTC` / `CTRI` é o que se junta. O login do token fica em `ParsedDuty.trainee`; `placeTrainees()` (depois do
  attach, antes do `placeSafetyMarks`) tira-o dos voos do dia antes do primeiro voo marcado e põe-no (FO) nos
  marcados. PARSE_VERSION 20. Verificado com o PDF real (não guardado).
- **0.9.3.13** — `CrewMember.seat` ('trainee' / 'safety'): nos voos com FO_SAFETY e formando conhecido, o outro FO é o
  safety pilot (utilizador: dia 23 — o FO do 1.º voo fica como FO_SAFETY quando entra o formando). Mostrado na lista da
  tripulação (FlightInfo). PARSE_VERSION 21. Verificado com o PDF real (não guardado).
- **0.9.3.14** — `W_PNC_ST` (verificação em voo de cabina de um tripulante não chefe de cabina; utilizador) lido
  como marca do dia (`DAY_FLIGHT_MARK` em `pgaGrid.ts`) e posto nos voos desse dia; só informação (MARK_LABEL).
  PARSE_VERSION 22.

---

## TODO / Backlog (decidir mais tarde)


- **Google Calendar (0.9.1) está no código mas escondido** até existir o secret `VITE_GOOGLE_CLIENT_ID` (cliente
  OAuth "Web application", origem `https://f100pilot.github.io`, Calendar API ativa, âmbito
  `calendar.app.created`). Com o secret, o próximo deploy mostra o botão — juntar então uma nota de versão.
- **IO:** ajuda de custo de um IO normal sozinho na base; código **APT** (sem apresentação) ainda não lido.

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
