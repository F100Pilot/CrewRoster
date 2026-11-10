# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.8.27.1`
- **Próxima versão ao promover:** `0.8.28` (ou superior, conforme o âmbito)

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

Em `0.8.28` (na exp) — auditoria de código:

- **Vencimento:** subsídios sobre todos os fixos; férias = fixos ÷ 30 × 42; pensões 6,5%/7,5% do subsídio
  (bate ao cêntimo com o recibo de julho).
- **Segurança:** backup sem credenciais CrewLink nem chaves do Google; perfil apagado leva os dados de
  vencimento; CSP no `index.html`; pdf.js sem `eval`; worker — cookie de sessão só para netline.pga.pt,
  `sessionToken` validado, erros com CORS (502), `Vary: Origin`, cache limitado, `hops` redigidos;
  workflow do worker com `contents: read`; dependências: react-router e afins atualizados, vitest 5.
- **Código morto removido:** sincronização Google Calendar (sem UI), re-parse só de tripulação
  (`refreshCrewFromPdfs`/`reattachCrew`/`crewParserVersion`), exports sem uso.
- **Desempenho:** pdf.js, tutorial e README carregados a pedido (−135 KB gzip no arranque).
- **Bug:** "hoje" em hora local em todo o lado (antes UTC em 14 sítios).
- **Privacidade:** nomes reais de tripulantes nos testes substituídos por sintéticos.
- **Worker:** as alterações só ficam ativas quando o `worker.js` for para o `master` (deploy automático).

Em `0.8.29` (na exp) — layout dinâmico:

- **Ecrã "Hoje"** como entrada (`/`), que muda com a fase do dia (pré-voo, em serviço, estadia,
  assistência, folga); céu à hora local do aeroporto; cor pelo destino. `dayPhase.ts` + testes.
- **Lista** passa para `/lista`, com vista **painel de partidas** opcional.
- Navegação: "Hoje" é a primeira aba; o atalho Android "Hoje" abre este ecrã.
- `0.8.29.1`: o dia inteiro (também dias sem voos: cartão de atividade + linha do tempo + números do dia)
  e a página com a paleta da fase, mais perto do esboço.

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
