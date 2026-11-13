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

## Em aberto (registar aqui até haver dados)

- **LYS 18/06 — ceia em falta**: mesmo padrão do C06, deve dar ceia 40 € + pernoita 10 €. Falta a
  escala do dia para o transformar em caso (C08).
- **Almoço pago num DH LIS→FRA** com apresentação 8 min depois do fim do horário (hora local):
  atraso, hora planeada diferente, ou regra própria do DH?
- **Almoço de 18 € num setor de 1h37** (RAK→LIS): bloco planeado ≤ 1h30?
- **Marrocos não está na Tabela 34**: os valores de estadia ficam de fora do total.
- **Nota "Pernoita\*"** da Tabela 34: texto por confirmar.
- **IO que não é o prevenir** (hora diferente da apresentação planeada): a app conta o tempo como
  serviço, sem ajuda de custo nem abonos — regra a confirmar pelo utilizador (nov 2026).
- **Totais de junho e agosto** do utilizador diferentes dos que o recibo implica — por explicar
  dia a dia com o extrato desses meses.
