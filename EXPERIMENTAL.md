# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.8.19.2`
- **Próxima versão ao promover:** `0.8.20` (ou superior, conforme o âmbito)

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

Em `0.8.20` (na exp):

- **Documentos a expirar na lista** — linha por cima do resumo dos limites quando um
  documento expira em ≤60 dias ou já expirou (vermelho ≤30, amarelo antes); toque →
  Documentos. Só pilotos (a cabina não tem Documentos). `domain/documentAlerts.ts`,
  `components/DocumentAlertCard.tsx`.
- **Evolução mensal nas Estatísticas** — colunas de bloco/serviço por mês, últimos 12
  meses, toque para ler. Serviço contado como nos limites (`dutyDays` com as regras do
  papel); meses sem escala guardada ficam "sem escala" (traço), nunca 0.
  `domain/monthlyTotals.ts`, `components/MonthlyChart.tsx`.

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
