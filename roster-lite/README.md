# CrewRoster Lite

Visualizador da escala da Portugália Airlines (NetLine / CrewLink) que corre
**inteiramente no browser** — sem servidor, sem login, sem Firebase.

Fluxo: exportas a tua escala do CrewLink (PDF, CSV ou ICS) → arrastas o ficheiro
para a app → ela faz o parsing localmente e mostra a escala em lista, calendário e
detalhe por dia. O resultado fica guardado no dispositivo (IndexedDB), por isso não
precisas de voltar a importar.

## Desenvolvimento

```bash
cd roster-lite
npm install
npm run dev        # http://localhost:5173
npm test           # testes unitários (Vitest)
npm run build      # gera dist/ (site estático)
npm run preview    # serve o build de produção
```

## Arquitetura de parsing (camadas)

O parsing está separado em camadas para o tornar afinável sem reescritas:

- **A — `src/parsing/pdf/extractText.ts`**: PDF → tokens com posição (x/y) via pdf.js.
- **B — `src/parsing/pdf/reconstructLines.ts`**: tokens → linhas/colunas.
- **C — `src/parsing/pdf/interpret.ts` + `profiles/pgaNetline.ts`**: linhas → `ParsedDuty[]`.
  Esta é a **única** camada que precisa de calibração quando houver um PDF real da PGA.

CSV e ICS (`src/parsing/csv`, `src/parsing/ics`) convergem no mesmo `ParsedDuty[]`.

### Parser PGA "Individual duty plan" (`pdf/pgaGrid.ts`)

O PDF da Portugália tem um layout **transposto**: cada período é uma grelha onde os
**dias são colunas** e os atributos (duty, aeroporto, horas, aeronave, info) ficam
empilhados por baixo de cada dia. Há várias grelhas por página (sobrepostas), por isso
o parser lê todas e **de-duplica por data**. As datas (só "Mon15") são reconstruídas a
partir da data de início do período impressa no cabeçalho ("15Jun26 -").

Está calibrado e testado contra um PDF real (`src/__tests__/fixtures/pga-tokens.json`,
anonimizado para apenas posições). Cobre: dias de folga, voos (nº, rota, horas,
aeronave), deadheads (DH), simulador, office duty e training.

**Limitações conhecidas** (refináveis com mais amostras):
- Dias com **vários voos** podem fundir/omitir dados (números de voo de 4 dígitos que
  coincidem com horas, ex. `1454`, são por vezes lidos como hora).
- O dia raro com **sim + deadhead** no mesmo dia pode não associar o nº ao deadhead.
- Nestes casos o texto bruto continua disponível na página **Debug** (`/debug`) e no
  fallback da lista, para verificação.

Para recalibrar com um novo PDF: importa-o, abre `/debug`, e compara. Se necessário,
captura um novo fixture de tokens e adiciona asserts em `src/__tests__/pgaGrid.test.ts`.

> O `pdf/interpret.ts` + `profiles/pgaNetline.ts` permanecem como **fallback genérico**
> para PDFs de outros layouts que não a grelha PGA.

## Alojamento

`npm run build` gera um site estático em `dist/`. Por omissão o `base` do Vite é
`/CrewRoster/` (para GitHub Pages). Para alojar na raiz (Netlify/Vercel) usa
`BASE=/ npm run build`.
