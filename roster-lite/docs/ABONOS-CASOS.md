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

## Em aberto (registar aqui até haver dados)

- **Extrato de outubro 2026 de um FO (0.9.3.13) — 3/8 dias certos.** Oito voltas de ida e volta a LIS; o extrato
  paga só o almoço de **02/10** (LIS–NCE–LIS, regresso NCE 10:37–13:11 UTC) e de **10/10** (LIS–PMI–LIS, regresso
  10:59–12:59), 18 € cada. A app dá esses dois como embarcados e paga em vez deles **09/10** (LIS–IBZ–LIS, regresso
  12:09–13:53: no relógio de IBZ parte às 14:09, depois do horário), **14/10** (LIS–RAK–LIS, setores de 1h30 e 1h23)
  e **15/10** (LIS–PXO–LIS, regresso de 1h29). Bem: 08/10 LPA, 16/10 DUS, 31/10 TLS (zero). 14 e 15/10 eram dias
  `W_PNC_ST` (verificação de cabina de outro tripulante — não implica nada).
  **Lido o texto do ROV (4.5.4–4.5.15, enviado pelo utilizador, não guardado): as regras da app estão como o texto**
  — direito pelas alíneas a/b/c do 4.5.5.1 com os relógios do 4.5.5.4; embarque pela hora local de partida
  (4.5.10.5); até 1h30 não embarca (4.5.11.4) e o *Block Time* é o do planeamento ("consoante o Block Time em cada
  período IATA"); menos de 5 h, uma refeição principal por voo (4.5.11.2 — por voo, não por PSV: o C04 tem duas).
  As diferenças vêm do que a escala de 14/11 não traz: **horas e blocos planeados** (09/10 com 9 min de atraso
  passa a atravessar o almoço; 14 e 15/10 com bloco planeado acima de 1h30 levam a refeição) e **irregularidades**
  (4.5.11.5: refeição não embarcada por atraso, registada no Flight Report / SCCR — 02 e 10/10?). Testado e
  rejeitado: embarcar fora do horário (4.5.4.5) acerta 5/8 mas parte o pequeno-almoço de maio; uma refeição por
  PSV (4.5.11.3) parte C04, C08 e o DHC de maio. **Falta:** um PDF de outubro descarregado antes dos voos, e saber se
  houve atraso / Flight Report em 02 e 10/10.
- **LYS 18/06 — ceia em falta**: mesmo padrão do C06, deve dar ceia 40 € + pernoita 10 €. Falta a
  escala do dia para o transformar em caso (C08).
- **Almoço pago num DH LIS→FRA** com apresentação 8 min depois do fim do horário (hora local):
  atraso, hora planeada diferente, ou regra própria do DH?
- **Almoço de 18 € num setor de 1h37** (RAK→LIS): bloco planeado ≤ 1h30?
- **Marrocos não está na Tabela 34**: os valores de estadia ficam de fora do total.
- **Nota "Pernoita\*"** da Tabela 34: texto por confirmar.
- **IO normal sozinho na base** (apresentou-se, ~1 h de serviço e depois IO, sem voos): os abonos seguem as regras
  normais (C08); **por confirmar** se paga ajuda de custo A (T) — por agora não paga. Sem apresentação, a escala
  mostra **APT**, assistência ou PLS em vez de IO — o código APT ainda não é lido (falta saber o que é).
- O prevenir vem no recibo como **"Per diem A PGA CTE T"** (na base, tributado por inteiro) — é como a app o conta.
- **Totais de junho e agosto** do utilizador diferentes dos que o recibo implica — por explicar
  dia a dia com o extrato desses meses.
