# Abonos RAACO — livro de casos

Cada caso real (feedback de um tripulante, ou uma linha de um extrato de Abonos Operacionais que
conferimos) fica registado **aqui** e como **teste** em
`src/domain/__tests__/raacoCases.test.ts`, com o mesmo id. O objetivo: nenhuma correção futura
pode estragar um caso que já estava certo — se estragar, o `npm test` falha e diz qual caso e qual
regra.

As regras gerais (Tabelas 32/33/34, embarque, DHC, estadias) estão em `src/domain/raaco.ts` e
nos testes de regra em `src/domain/__tests__/raaco.test.ts`.

**Privacidade:** só aeroportos, datas e horas (a forma da escala). Números de voo sintéticos
(TP9xxx), sem nomes, sem valores de vencimento. Escalas, extratos e o ROV não entram no repositório.

## Como tratar um caso novo

1. Pedir a escala do dia (horas UTC de cada setor, dia X, assistências) e o que o extrato paga —
   as quatro colunas: pequeno-almoço, almoço, jantar, ceia + pernoita.
2. Escrever o caso no fim de `CASES` em `raacoCases.test.ts` (id `Cnn-AEROPORTO-dd-mm-assunto`,
   `reported` como foi dito, `rule` a regra que se tira) e **confirmar que falha**.
3. Corrigir `raaco.ts` com a regra mais pequena que explica o caso.
4. Correr **todos** os casos (`npx vitest run src/domain/__tests__/raaco`): nenhum antigo pode
   partir. Se partir, a nova regra está errada ou os dois casos contradizem-se — registar em
   "Em aberto" e perguntar, em vez de forçar.
5. Conferir os meses reais que tivermos (extratos) antes e depois: a correção não pode piorar os que
   já batiam.
6. Acrescentar a linha à tabela abaixo, subir a versão e escrever a nota de versão.

## Casos resolvidos

| Id | Versão | O que foi reportado | Causa | Regra adotada |
|---|---|---|---|---|
| C01-RAI-noite-depois-meia-noite | 0.8.34.1 | Praia: pernoita 14 €; com chegada depois da meia-noite local a pernoita não aparecia | Só contava uma noite quando a estadia passava a meia-noite | Pernoita = qualquer parte de 00:00–05:00 local na estadia, datada da véspera. Cabo Verde 14 € |
| C02-RAI-dia-X | 0.8.34.2 | "Na primeira noite de dia X não tem a pernoita" | O regresso apresentado exatamente à meia-noite não contava a 2.ª noite | Dia X fora = duas pernoitas; limite das 05:00 e da meia-noite inclusivos |
| C03-FNC-dia-X | 0.8.34.2 | (controlo do C02, chegada ao fim da tarde) | — | Idem |
| C04-DUB-26-09 | 0.8.34.2 | Faltava a pernoita da primeira noite (aterragem 23:43 local) | Idem C01 | Idem; ceia ao valor da Irlanda |
| C05-VLC-14-10 | 0.8.34.2 | Faltava a pernoita da primeira noite | Idem C01 | Idem; jantar e ceia ao valor de Espanha |
| C06-BCN-12-07-ceia | 0.8.34.3 | Só aparecia a pernoita (10 €), faltava a ceia | A app dava a ceia como embarcada no último setor (LIS→BCN, chegada 01:45 local) | **A ceia nunca é embarcada**: paga sempre que devida, Tabela 34 local se o serviço acaba fora, 18 € na base |
| C07-IO-prevenir | 0.9.2 | IO (irregularidade operacional) por causa do prevenir — chamado na apresentação para o teste de álcool, não fez o voo; os abonos são pagos e o duty conta. A app deixava o dia vazio | O código IO não era lido | IO que começa à hora da apresentação do PSV planeado = prevenir: o período do IO é um PSV na base, refeições pela Tabela 33 (almoço 18 €); conta duty e ajuda de custo A nacional (sem isenção) |
| C07b-IO-prevenir-marcado | 0.9.2 | (sem escala anterior guardada para comparar) | — | O tripulante marca o dia como prevenir; conta igual |
| C07c-IO-prevenir-DT | 0.9.3.5 | Um colega teve de marcar o prevenir à mão. O utilizador: "Só quando o duty é exatamente igual, entre uma escala que existia sem IO, e depois passa a existir com IO, é que é prevenir" (Manchester não foi prevenir) | A app comparava a hora de início com uma apresentação que calcula (partida − 1 h), não com o duty da escala | Prevenir = **[DT] impresso igual** antes e depois do IO. Sem [DT] guardado (dias antigos): o IO tem de cobrir o serviço planeado — apresentação e fim (última chegada + 30 min) com margem de 15 min |
| C08-IO-normal-MAN | 0.9.2.2 | IO normal: LIS→MAN, MAN→MAN, IO em MAN 11:00–15:08 UTC, estadia em Manchester, DH no dia seguinte — "teria de assumir as ajudas de lá" | (já dava o mesmo total; o IO ficava fora do PSV) | O IO faz parte do PSV do dia: refeições pelas regras normais com o período do IO, estadia com a Tabela 34 do sítio onde acaba. Só o prevenir é especial. *Sem extrato — regra do colega* |
| C09-FNC-10-09-pernoita-nao-planeada | 0.9.3.22 | Extrato de setembro de um CP: 10/09 FNC→LIS pago p.-alm. 25 € + almoço 18 €; na véspera o FNC→LIS voltou ao Funchal (FNC→FNC), dia que na escala original acabava em Lisboa. O colega confirma o extrato | A app dava 0: tratava a estadia como planeada (pequeno-almoço embarcado à saída de Lisboa) e o almoço como embarcado no voo seguinte | **Pernoita não planeada** (último setor de volta ao aeroporto de onde saiu): pequeno-almoço do hotel pago pela Tabela 34 local (sem *double catering*, Tabela 35 nota 1 / 4.5.8.2); o voo de recuperação não leva refeição → refeições principais pela Tabela 33. **Mudou o C08** (MAN→MAN): p.-alm. de 09/04 passa a 29 € — **confirmado pelo colega: a empresa pagou-o** |
| C10-RAK-21-09-plano-da-epoca | 0.9.3.23 | Extrato de setembro de um CP: 21/09 LIS→RAK→LIS (planeado 08:00–09:35 e 10:45–12:25 UTC) sem almoço pago. O colega confirma que havia almoço de tripulação a bordo ("No meu RAK não tenho a receber") | Com Marrocos em UTC+0 (desde 20/09/2026) o RAK→LIS sai às 10:45 locais e não atravessa o almoço → a app pagava 18 € | O **Meal Plan é feito por época IATA** (4.5.10.2–3): o embarque segue a hora do aeroporto em vigor no **início da época** (verão: último domingo de março; inverno: último domingo de outubro; geral para todos os anos desde 0.9.3.24) — em Marrocos, UTC+1 até 25/10/2026. Só a verificação do embarque usa essa hora; o direito à refeição e as horas mostradas seguem a hora real |
| C11-outubro-FO-plano-original | 0.9.3.24 | Extrato de outubro de um FO conferido com a escala ORIGINAL (impressa a 15/09): 08/10 LPA, 14/10 RAK, 15/10 PXO, 16/10 DUS sem refeições | A app instalada pagava 14 e 15/10: versão antiga (RAK) e horas voadas (PXO→LIS voou 1h29) | Já resolvido pelas regras atuais com as horas planeadas: 14/10 pelo C10; 15/10 pelo bloco **planeado** de 1h35 (> 1h30 embarca, 4.5.11.4). Sem o PDF de antes dos voos a app não sabe o bloco planeado |

## Em aberto (registar aqui até haver dados)

- **Extrato de outubro 2026 de um FO — com a escala original (15/09) a app bate 5 de 8 dias** (08, 14, 15, 16 e 31/10:
  caso C11). Faltam três, que **se contradizem com o C10** (RAK, almoço a bordo confirmado):
  - **02/10 LIS–NCE–LIS** (regresso planeado 10:30–13:15 UTC = 12:30–15:15 em Nice) e **10/10 LIS–PMI–LIS** (regresso
    10:50–12:50 UTC = 12:50–14:50 em Palma): a empresa paga o almoço (18 €); pela regra da app o regresso atravessa a
    janela do almoço (12:30–14:00) e leva-o embarcado.
  - **09/10 LIS–IBZ–LIS** (regresso 12:05–14:05 UTC = 14:05 em Ibiza): a empresa não paga; a app paga 18, porque o voo
    sai de Ibiza depois das 14:00.
  - Uma regra que acerta os três — "o voo sai dentro da janela, na hora de Lisboa" (NCE 11:30, PMI 11:50: não; IBZ
    13:05: sim) — parte o C10 (RAK→LIS sai às 11:45 no plano e tinha almoço). Não forçado. **Pergunta ao colega:**
    havia almoço de tripulação a bordo nos regressos de NCE (02/10), PMI (10/10) e IBZ (09/10)? Se em 02 e 10/10 não
    havia (falha de catering / irregularidade, 4.5.11.5), a app está certa nesses dias e só o IBZ fica por explicar.
- **Setembro 2026 de um CP — extrato 732 €, app (0.9.3.14) 725 €.** Com o PDF ORIGINAL (impresso a 15/08) e a escala depois
  do regresso: 13–15/09 (MRS, FNC), 22–23/09 (BIO, BCN), 26–28/09 (DUB) e 07–09/09 batem.
  - **20/09 LIS–ALC–LIS**: o almoço que a app pagava era um **fuso em falta** (ALC lido na hora de Lisboa) — corrigido em
    0.9.3.21; fica a diferença do **pequeno-almoço de 5 €** que a empresa paga (apresentação 06:00 local, LIS→ALC às 07:00:
    a app dá-o embarcado no 1.º setor). Por explicar.
  - **21/09 LIS–RAK–LIS**: resolvido — caso **C10** (0.9.3.23): o colega confirma o almoço a bordo; o Meal Plan da época
    de verão ainda usa a hora antiga de Marrocos (UTC+1).
  - **16/09 FNC→LIS 02:51**: com as horas voadas (fim antes das 06:00) a app dá 0, como o extrato; com as planeadas (03:05)
    daria pequeno-almoço 5 — a aquisição parece seguir o voado.
  - **10/09 TP9261 FNC→LIS**: resolvido — caso **C09** (0.9.3.22).
  - Exames médicos (resposta do colega): 2 dias = 2 per diem B, duty 3 h num e 4 h no outro — como a app (0.9.3.16).
- **Ramadão 2026 em Marrocos (≈ 15/02–22/03)** — Marrocos esteve em UTC+0 a meio da época de inverno. Com a regra
  das épocas (C10, 0.9.3.24) o embarque nesses dias segue UTC+1 (a hora do início da época). Não confirmado: falta um
  extrato com voos para Marrocos nesse período. (Desde 20/09/2026 Marrocos fica em UTC+0 todo o ano — sem novos casos.)
- **LYS 18/06 — ceia em falta**: mesmo padrão do C06, deve dar ceia 40 € + pernoita 10 €. Falta a
  escala do dia para o transformar em caso (C08).
- **Almoço pago num DH LIS→FRA** com apresentação 8 min depois do fim do horário (hora local):
  atraso, hora planeada diferente, ou regra própria do DH?
- **Almoço de 18 € num setor de 1h37** (RAK→LIS): bloco planeado ≤ 1h30?
- **Marrocos não está na Tabela 34** (confirmado no Anexo 7.6, 14/11/2026): os valores de estadia ficam de fora do total.
- ~~Nota "Pernoita\*" da Tabela 34~~ — confirmada (Anexo 7.6): "devido por cada noite em que o Tripulante esteja alojado
  em estabelecimento hoteleiro". Tabelas 32–34 da app conferidas valor a valor com o Anexo 7.6: iguais.
- **IO normal sozinho na base** (apresentou-se, ~1 h de serviço e depois IO, sem voos): os abonos seguem as regras
  normais (C08); **por confirmar** se paga ajuda de custo A (T) — por agora não paga. Sem apresentação, a escala
  mostra **APT**, assistência ou PLS em vez de IO — o código APT ainda não é lido (falta saber o que é).
- O prevenir vem no recibo como **"Per diem A PGA CTE T"** (na base, tributado por inteiro) — é como a app o conta.
- **Totais de junho e agosto** do utilizador diferentes dos que o recibo implica — por explicar
  dia a dia com o extrato desses meses.
