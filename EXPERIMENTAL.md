# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.8.7`
- **Próxima versão ao promover:** `0.8.8` (ou superior, conforme o âmbito)

## Como promover tudo para produção (quando estiver pronto)

1. Na branch `claude/crew-per-flight`: subir `APP_VERSION` em
   `roster-lite/src/version.ts` e adicionar a entrada em `RELEASE_NOTES`
   (resumindo os itens abaixo).
2. `git checkout master && git merge --no-ff claude/crew-per-flight`.
3. `git push origin master` → o workflow publica a produção.
4. **Esvaziar a secção "Pendente" deste ficheiro** (passou tudo para as notas de
   versão).

---

## Pendente para a próxima versão

### 1. Login automático (escondido) no download quando há credenciais guardadas
Se o perfil ativo tiver **código de tripulante + password** guardados em
Definições, ao abrir o diálogo de download (☁) a app faz o **login ao CrewLink
em segundo plano** e salta direto para o ecrã do **intervalo de datas** — o
formulário de login deixa de aparecer. Se não houver credenciais, ou se o login
automático falhar (ex. password mudada), mostra o formulário (já preenchido) com
o erro, para o utilizador corrigir.

- **Ficheiros:** `roster-lite/src/components/DownloadRosterDialog.tsx`
- **Commit:** `ac76881`
- **Testar:** Definições → Acesso ao CrewLink (com credenciais guardadas) →
  clicar na ☁ → deve ir direto ao intervalo de datas, sem pedir login.

### 2. Popup de confirmação ao guardar/remover credenciais
Ao **Guardar** com credenciais preenchidas, aparece um popup (snackbar) verde:
*"Credenciais do CrewLink guardadas neste dispositivo."*. Ao **Esquecer
credenciais**: *"Credenciais removidas deste dispositivo."*.

- **Ficheiros:** `roster-lite/src/components/SettingsDialog.tsx`
- **Commit:** `f01aa85`
- **Testar:** Definições → Acesso ao CrewLink → preencher → **Guardar** → ver o
  popup em baixo.

### 3. "Com quem voo" (pesquisa de colega)
Tocar num tripulante no pop-up da tripulação de um voo abre uma página com
**todos os voos partilhados com esse colega** (data, voo, rota, função), com uma
**pesquisa** (código ou apelido) para escolher qualquer colega da escala e a
contagem de voos em comum. Tocar num voo abre o dia **já nesse voo** (destacado),
não no primeiro do dia.

- **Ficheiros:** `roster-lite/src/domain/crewSearch.ts`,
  `roster-lite/src/pages/CrewSearchPage.tsx`, `App.tsx` (rota `/crew/:login`),
  `roster-lite/src/components/FlightInfo.tsx` (nomes clicáveis).
- **Testar:** abrir um voo com tripulação → ícone 👥 → tocar num nome.

### 4. Pôr/nascer do sol + tempo noturno por setor
No banner do voo, um selo **☀️ diurno / 🌙 noturno / 🌗 parcial** com **minutos de
noite** estimados (amostragem da rota em posição e tempo, ortodrómica) e o
**nascer (↑) / pôr (↓) do sol em UTC** em cada aeroporto. Base para o tempo
noturno do logbook (lote seguinte).

- **Ficheiros:** `roster-lite/src/domain/sectorSun.ts`,
  `roster-lite/src/pages/DayDetailPage.tsx`.
- **Testar:** abrir um dia com voo → ver a barra dia/noite e os cartões do sol.
- _Apresentação gráfica:_ barra dia/noite + cartões de nascer/pôr do sol por
  aeroporto + chip do tipo de voo (ícones sol/lua).

### 5. Logbook: tempo noturno por setor + export EASA-style
Coluna **Noite** no diário (por setor, totais por mês e total geral), calculada
a partir do sol ao longo da rota. O **export CSV** passa a incluir **IFR**
(= bloco, operação de companhia toda em IFR), **Noite** e **aterragens
dia/noite** — colunas compatíveis com logbook EASA / importadores (mccPILOTLOG).

- **Ficheiros:** `roster-lite/src/domain/logbook.ts`,
  `roster-lite/src/pages/LogbookPage.tsx`.
- **Testar:** Diário → ver a coluna Noite e os totais; botão exportar → abrir o
  CSV e confirmar as colunas IFR / Noite / aterragens.

---

### 6. QoL — Pesquisa global
Ícone de **lupa** na barra de topo → página de pesquisa que percorre a escala:
**voo** (número, aeroporto, rota, tripulante), **tipo de serviço** e **datas**.
Cada resultado salta para o dia (e foca o voo).

- **Ficheiros:** `roster-lite/src/domain/rosterSearch.ts`,
  `roster-lite/src/pages/SearchPage.tsx`, `App.tsx` (rota `/search`),
  `roster-lite/src/components/Layout.tsx` (ícone na barra).
- **Testar:** lupa no topo → procurar "TP400", "RAK", apelido de um colega, "30/06".

---

## A implementar a seguir na exp (pedido, ainda por fazer)

- **TAF/METAR descodificado** à partida/chegada. ⚠️ _Bloqueio:_ o
  `aviationweather.gov` não tem CORS e o proxy da app está noutro repositório.
  Opções a decidir: (a) chave grátis opcional (CheckWX/AVWX) nas Definições, à
  semelhança do AeroDataBox; (b) proxy CORS público (menos robusto); (c) manter
  o Open-Meteo atual com apresentação mais aeronáutica (sem TAF oficial).
- **Visualização/QoL (resto):** estatísticas anuais (heatmap, aeroportos/países);
  partilhar o mês como imagem.

## TODO / Backlog (decidir mais tarde)

- **Stand em LIS/OPO via FLIC da TAP** — fonte robusta encontrada pelo utilizador
  (páginas internas `flic.tap.pt`):
  - `https://flic.tap.pt/FLIC_UI/FLIC.aspx?Id=PGA-LIS_ARR`
  - `https://flic.tap.pt/FLIC_UI/FLIC.aspx?Id=PGA-LIS_DEP`
  - `https://flic.tap.pt/FLIC_UI/FLIC.aspx?Id=PGA-OPO_ARR`
  - `https://flic.tap.pt/FLIC_UI/FLIC.aspx?Id=PGA-OPO_DEP`
  - _A investigar:_ provavelmente exige rede/login TAP e CORS bloqueado →
    abrir link / scraping autenticado; ver como integrar (talvez "abrir FLIC" por voo).
- **Painel de FTL / fadiga** (contadores 7/14/28 dias e 12 meses, avisos de
  limite, FDP máximo). _Precisa dos limites reais da Portugália._
- **Lembretes locais (notificações da PWA)** para check-in e documentos a expirar.
- **Componente de vento cruzado** por pista (precisa de BD de pistas).
- **Estimador de ajudas de custo / per diem** (precisa das taxas).

---

_Última atualização: 2026-06-25._
