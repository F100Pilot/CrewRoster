# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.8.18.3`
- **Próxima versão ao promover:** `0.8.19` (ou superior, conforme o âmbito)

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

_(Vazio — tudo o que estava pendente foi promovido em `0.8.18.3`.)_

---

## TODO / Backlog (decidir mais tarde)

- **Do AE SIPLA, ainda por fazer** (ver análise de 16/10/2026): verificação das folgas
  (RUPT cl. 21: ≥10/mês, ≥111/ano, ≤6 dias entre períodos, 2×72h ou 1×96h, sáb+dom a cada
  6 semanas), Early Start / Late Finish / Night Duty (cl. 22), estimador de per diem
  (RRRGS cl. 9, tabela A2.2 — valores marcados "sujeito a confirmação" no documento),
  créditos de duty-pay/block-pay vs plafonds (RRRGS cl. 2/12), contador de 42 dias de férias.
- **Lembretes locais (notificações da PWA)** para check-in e documentos a expirar.
- **Componente de vento cruzado** por pista. _A BD de pistas deixou de ser um bloqueio:
  a `runways.csv` do OurAirports é domínio público e bastam os ~40 aeroportos da rede,
  num JSON pequeno carregado em lazy como o `airportCoordsFallback.json`._

---

_Última atualização: 2026-09-20._
