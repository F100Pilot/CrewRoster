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

> O perfil PGA (`pgaNetlineProfile`) é **provisório**. Para o calibrar: importa um PDF
> real, abre a página **Debug** (`/debug`), lê o texto extraído e ajusta os padrões /
> formato de data em `profiles/pgaNetline.ts`. Guarda o texto como fixture em
> `src/__tests__/fixtures/` e escreve o teste correspondente.

## Alojamento

`npm run build` gera um site estático em `dist/`. Por omissão o `base` do Vite é
`/CrewRoster/` (para GitHub Pages). Para alojar na raiz (Netlify/Vercel) usa
`BASE=/ npm run build`.
