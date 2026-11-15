# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.9.3.46`
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

- **0.9.3.63** — Vencimento: dia GAB reduz os plafonds como um dia de férias; feriado só no duty-pay (block-pay de junho de 2026 bate com o recibo de julho).
- **0.9.3.62** — Vencimento: IRS como no recibo — o do mês sobre o fixo, o do mês anterior refeito com o variável (menos o já retido).
- **0.9.3.61** — Vencimento: a linha "Instrução em terra" aparece sempre que há valor por hora, para escrever horas de meses sem sessões na escala.
- **0.9.3.60** — Vencimento: FAM_INS + LIFUS_INS no mesmo voo = line check (recibo de junho de 2026); a escala lia mal as duas marcas juntas.
- **0.9.3.59** — Vencimento: os dias de gabinete (GAB) saem do duty-pay, como a instrução em terra (recibos de março e junho de 2026).
- **0.9.3.58** — Vencimento: a janela das horas de instrução diz só "Horas de instrução em terra".
- **0.9.3.57** — Vencimento: as horas de instrução em terra do mês escrevem-se no cartão (✎), as feitas ou as previstas.
- **0.9.3.56** — Vencimento: até março de 2026, os abonos das deslocações de simulador não são tributados e o per diem "T" é tributado por inteiro (bate com os recibos de janeiro a abril). Taskforce: o próprio check e o dia a seguir não contam como sessão paga.
- **0.9.3.55** — Vencimento: "A partir de um recibo" propõe o recibo aberto no Vencimento, e não o próximo.
- **0.9.3.54** — Vencimento: até janeiro de 2026, o per diem das deslocações de simulador é tributado por inteiro ("A … T"). Fevereiro a abril ainda por confirmar.
- **0.9.3.53** — Calendário: os dias com simulador e outro serviço ficam com a tecla dividida na diagonal, nas cores dos dois serviços.
- **0.9.3.52** — Vencimento: opção "Todas as sessões de simulador são pagas" (taskforce). Calendário: marca "SIM" nos dias com simulador e DHC.
- **0.9.3.51** — Vencimento: guardar "a partir de um recibo" ou "todos os meses" muda só os valores alterados. Os recibos com valores só seus deixam de ser repostos.
- **0.9.3.50** — Vencimento: no recibo de janeiro, o IRS do variável de dezembro (ano anterior) é retido à parte, com a sua própria taxa, como no recibo.
- **0.9.3.49** — Vencimento: o subsídio de gabinete paga só os dias GAB do mês entre o "a partir do" e o "até ao" (por exemplo, do 3.º ao 7.º), definidos nas Definições.
- **0.9.3.48** — Vencimento: linha "Instrução em terra" (sessões FP…_INST × valor por hora). Esses dias saem do duty-pay. As horas são provisórias, contadas pelas sessões da escala; falta confirmar como a empresa as conta.
- **0.9.3.47** — Vencimento: as Definições abrem com os valores do recibo que está aberto no Vencimento, e "Só este recibo" grava nele. A barra de guardar passou a uma linha, e a escolha do recibo está numa janela que abre ao Guardar.

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
