# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.8.21`
- **Próxima versão ao promover:** `0.8.22` (ou superior, conforme o âmbito)

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

Em `0.8.22` (na exp):

- **Estimativa de vencimento** (pilotos, experimental, desligada por omissão) — Definições →
  "Estimativa de vencimento": categoria, VB, VE, VS, complementos e per diem (valores do AE como
  ponto de partida). Guardado só no dispositivo (`crewroster.pay.<userId>`). Cartão em `/limites`
  com o bruto do recibo do mês seguinte: RB + excedentes duty-pay/block-pay (o mais favorável),
  per diem A/B, complementar (cl. 10), extensões e descansos reduzidos. `domain/payEstimate.ts`,
  `domain/holidaysPT.ts`, `components/PayEstimateCard.tsx`, `components/PaySettingsSection.tsx`.
  Por validar contra um recibo real.

Em `0.8.22.1` (na exp):

- **Etiquetas alinhadas na lista** — a data de cada dia tem largura fixa (`DATE_COLUMN` em
  `RosterPage.tsx`), por isso Hoje / Novo / Alterado / ⚠ verificar começam todas na mesma coluna.

Em `0.8.22.2` (na exp):

- **Estimativa de vencimento afinada com o recibo de outubro** — sessões FP* (simulador arquivado
  novo campo "Sessão de simulador como instrutor" (códigos `_INST`); textos das Definições dizem que
  linhas do recibo somar. Per diem CTE (229,50 / 153,00) confirmado.

Em `0.8.22.3` (na exp):

- **Regra do per diem confirmada** contra a escala de setembro e o recibo de outubro (9 A + 7 B, dia
  a dia): A = voo, simulador, assistência no aeroporto; B = estadia, FP (formação presencial, também
  como instrutor), gabinete (GAB), S.EXT. e médico.

Em `0.8.22.4` (na exp):

- **Marca das sessões de simulador** — o parser associa `OPC`/`LPC`/`OPC_INS`/`LPC_INS` (sub-coluna
  própria) à sessão de simulador do dia (`observations`); `PARSE_VERSION` 13. Sessões de instrutor =
  marcadas `_INS` + 2.º dia do check (`instructorSimDates`). Setembro real: 4 instrutor + 2 próprias,
  igual ao recibo.

Em `0.8.22.5` (na exp):

- **Voos como instrutor** — o parser liga `LIFUS_INS` / `FAM_INS` (sub-coluna própria, à esquerda
  da perna) ao voo; `PARSE_VERSION` 14. Detalhe do dia mostra a marca junto ao número do voo (e
  OPC/LPC nas sessões de simulador). Estimativa: campo "Line training como instrutor" por dia
  (setembro real: 1 dia FAM_INS = 1 × Line Training no recibo).

Em `0.8.22.6` (na exp):

- **Etiqueta de instrução na lista** — LIFUS / FAM / OPC / LPC (· instr.) ao lado da data, na coluna
  das etiquetas. Rótulos partilhados em `domain/dutyMarks.ts`.

Em `0.8.22.7` (na exp):

- **Definições do vencimento mais claras** — nomes exatos das linhas do recibo em VE / VS / outros
  fixos, e o total da parte fixa para conferir (faltava a anuidade de Comando e as diuturnidades).

Em `0.8.23` (na exp):

- **Líquido na estimativa de vencimento** — IRS pelas tabelas de retenção 2026 (continente, tabelas
  I–III, `domain/irsWithholding.ts`), SS 11%, descontos fixos; per diem dos dias fora com parte isenta
  (média de dois recibos reais), dos dias na base tributado. Novos campos em Definições → Descontos.
  Recibos de setembro e outubro reproduzidos a poucos euros.
- `0.8.23.1`: nomes das situações de IRS mais claros (casado dois titulares vs único titular).
- `0.8.23.2`: fundo de pensões pelo AE (RRRGS cl. 16): contr. PGA 6,5% (abono sem IRS/SS) e depósito
  SIPLA 7,5% de VB + VE + VS, calculados automaticamente; o interruptor tira/repõe os valores manuais.
- `0.8.23.3`: quota sindical em % de uma base (vazia = VB + VE + VS); base exata do SIPLA por confirmar.

---

## TODO / Backlog (decidir mais tarde)

- **Do AE SIPLA, ainda por fazer**: estimador de per diem (RRRGS cl. 9, tabela A2.2 —
  aguarda valores confirmados / AE atualizado), créditos de duty-pay/block-pay vs plafonds
  (RRRGS cl. 2/12), mínimo anual de 111 folgas, regime alternativo de 11 dias.
- **Lembretes locais (notificações da PWA)** para check-in e documentos a expirar.
- **Componente de vento cruzado** por pista. _A BD de pistas deixou de ser um bloqueio:
  a `runways.csv` do OurAirports é domínio público e bastam os ~40 aeroportos da rede,
  num JSON pequeno carregado em lazy como o `airportCoordsFallback.json`._

---

_Última atualização: 2026-10-29._
