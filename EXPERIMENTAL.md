# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.8.14.4`
- **Próxima versão ao promover:** `0.8.15` (ou superior, conforme o âmbito)

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

- **Sincronização passa a atualizar voos já executados.** O download começava sempre em
  **hoje** (`DownloadRosterDialog`/`ImportPage`), por isso um setor já voado — cujas horas o
  CrewLink só reescreve depois de operado — nunca voltava a entrar no PDF e o Diário ficava
  com as horas planeadas para sempre. Nova constante `SYNC_LOOKBACK_DAYS = 7`
  (`domain/rosterWindow.ts`): o download começa por omissão 7 dias atrás. `mergeDuties` já faz
  override por dia e o `mergeLogbook` já atualizava as horas — faltava só a janela.
- **Marcar PF deixa de congelar o setor.** O diálogo de edição punha `edited: true` em
  qualquer gravação, incluindo só marcar quem foi PF — o que travava para sempre a
  sincronização das horas desse setor. Agora só marca `edited` quando os **dados do voo**
  mudam mesmo; correções manuais continuam protegidas.

---

## TODO / Backlog (decidir mais tarde)

- **Painel de FTL / fadiga** (contadores 7/14/28 dias e 12 meses, avisos de
  limite, FDP máximo). _Precisa dos limites reais da Portugália._
- **Lembretes locais (notificações da PWA)** para check-in e documentos a expirar.
- **Componente de vento cruzado** por pista (precisa de BD de pistas).
- **Estimador de ajudas de custo / per diem** (precisa das taxas).

---

_Última atualização: 2026-07-10._
