# Diagnosticar e reportar erros de parsing

Quando um dia da escala aparecer **errado** (em falta, na data errada, com conteúdo
a mais/menos, ou com um código não reconhecido), este guia mostra como capturar os
dados exatos para a correção ser feita **uma vez** e ficar protegida por um teste
permanente — em vez de adivinhar.

## O que enviar

1. Abre a app e importa/descarrega a escala problemática.
2. Vai à página **Debug** (ícone 🐞 na barra inferior).
3. Carrega em **"Diagnosticar PDF (datas das bandas)"** e escolhe o **mesmo PDF**
   (podes descarregá-lo primeiro do histórico de PDFs, se precisares).
4. No texto que aparece, copia:
   - a secção do topo (as linhas `#0 […] -> …` das bandas), **e**
   - na secção **`--- Tokens por dia ---`**, as **linhas dos dias errados**
     (ex. `2026-06-30: …`).
5. Diz, em uma frase, **o que devia aparecer** nesse dia (ex.: "dia 30 é OFF, o
   hotel NH/FRA é do voo do dia 29").

Com isso:
- os tokens viram um **golden test** (`src/__tests__/`) que falha até estar correto e
  nunca mais regride;
- a regra de parsing (`src/parsing/pdf/pgaGrid.ts`) é ajustada com base em dados
  reais, não em suposições.

## Como ler o diagnóstico

```
Calendário: 2026-01-01 … +421d
Bandas: 17
#0 [Thu15…Thu01] len=15 rev=Y cand=[2026-01-01, …] -> 2026-01-01 … 2026-01-15
...
Dias com registo: 203 (2026-01-01 … 2026-07-29)
Sem buracos no intervalo.
--- Tokens por dia ---
2026-06-30: OFF | NH | FRA | ...
```

- **`#n [primeira…última] -> data inicial … data final`** — onde cada banda da grelha
  foi colocada no calendário. Se uma banda aterrar no mês errado, é um problema de
  *datação*.
- **`Dias EM FALTA`** — dias dentro do intervalo sem registo (geralmente um código não
  reconhecido).
- **`--- Tokens por dia ---`** — os tokens em bruto que caíram em cada dia. É aqui que
  se vê se um marcador (hotel, tripulação) está a "sangrar" para o dia errado.

## Códigos de serviço

Os códigos reconhecidos estão em `src/parsing/pdf/pgaGrid.ts` (`classifyDuty`) e
`src/domain/dutyType.ts` (`inferDutyType`), e documentados na app em **Legenda de
códigos** (ícone ❓). Se aparecer um código novo, basta dizeres o que significa e a
que categoria pertence (voo, folga, standby, formação, férias, ausência…).

## Deploy do worker (Cloudflare)

A app (GitHub Pages) atualiza-se sozinha. O **worker** (proxy para o CrewLink) é um
ficheiro separado — sempre que `roster-lite/worker/worker.js` mudar, tens de fazer
deploy:

- **Dashboard:** dash.cloudflare.com → Workers & Pages → `crewroster-proxy` →
  *Edit code* → apaga tudo → cola o conteúdo de `roster-lite/worker/worker.js` →
  *Deploy*.
- **CLI:** a partir de `roster-lite/worker/`, corre `./deploy.sh` (usa `wrangler deploy`).
