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

## Dados de voo (matrícula, porta) — AeroDataBox

No detalhe de um dia de voo, a app mostra a **matrícula da aeronave**, **terminal/porta**
e **estado** do voo. Estes dados vêm da **AeroDataBox** e só existem **perto do voo**
(horas antes / no próprio dia) — para voos distantes aparece "Sem dados ainda".

Para ativar (modo recomendado — **dentro da app**):

1. Cria conta em [RapidAPI](https://rapidapi.com) e subscreve a **AeroDataBox** (tem
   plano gratuito). Copia a tua *X-RapidAPI-Key*.
2. Na app, toca no ícone de **engrenagem ⚙️** (barra de topo) → cola a chave em
   **"Chave AeroDataBox"** → *Guardar*. A chave fica **só neste dispositivo**
   (localStorage) e é enviada ao worker por HTTPS a cada pedido — nunca é guardada
   pelo worker nem vai para o repositório.

Alternativa (chave partilhada por todos, definida no worker como **segredo**):

- **Dashboard:** `crewroster-proxy` → *Settings* → *Variables and Secrets* → *Add* →
  tipo *Secret* → nome `AERODATABOX_KEY`, valor = a chave → *Deploy*.
- **CLI:** `wrangler secret put AERODATABOX_KEY` (a partir de `roster-lite/worker/`).

Sem chave (nem na app nem no worker), o endpoint responde `configured:false` e a app
simplesmente **não mostra** a secção — não dá erro.

> O **estacionamento (stand)** exato muitas vezes não é publicado pela API; nesse caso
> mostra-se a **porta/terminal**, que é o mais próximo disponível.
