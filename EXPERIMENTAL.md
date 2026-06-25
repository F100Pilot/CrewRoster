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
contagem de voos em comum. Cada voo abre o respetivo dia.

- **Ficheiros:** `roster-lite/src/domain/crewSearch.ts`,
  `roster-lite/src/pages/CrewSearchPage.tsx`, `App.tsx` (rota `/crew/:login`),
  `roster-lite/src/components/FlightInfo.tsx` (nomes clicáveis).
- **Testar:** abrir um voo com tripulação → ícone 👥 → tocar num nome.

---

## A implementar a seguir na exp (pedido, ainda por fazer)

- **TAF descodificado** à partida/chegada (tempo significativo sinalizado).
- **Pôr/nascer do sol + tempo noturno por setor** (usa `utils/sun.ts`).
- **Logbook/registo:** exportar para formato standard (CSV EASA / mccPILOTLOG);
  tempo noturno/IFR calculado por setor.
- **Visualização/QoL:** pesquisa global na escala; estatísticas anuais (heatmap,
  aeroportos/países); partilhar o mês como imagem.

## TODO / Backlog (decidir mais tarde)

- **Painel de FTL / fadiga** (contadores 7/14/28 dias e 12 meses, avisos de
  limite, FDP máximo). _Precisa dos limites reais da Portugália._
- **Lembretes locais (notificações da PWA)** para check-in e documentos a expirar.
- **Componente de vento cruzado** por pista (precisa de BD de pistas).
- **Estimador de ajudas de custo / per diem** (precisa das taxas).

---

_Última atualização: 2026-06-25._
