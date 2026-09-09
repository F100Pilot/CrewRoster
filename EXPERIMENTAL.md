# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.8.15.5`
- **Próxima versão ao promover:** `0.8.16` (ou superior, conforme o âmbito)

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

### `0.8.15.6` — horas do voo em hora local (LT)

No detalhe do voo, a partida e a chegada (STD/STA) mostram agora a **hora local
do aeroporto** na linha principal (`06:30 LT`) e o **UTC entre parênteses** por
baixo (`(05:30 z)`) — antes era ao contrário. Se o fuso do aeroporto for
desconhecido, o UTC volta a ocupar a linha principal.

A barra dia/noite e o cartão de nascer/pôr do sol mantêm-se em UTC (o bloco está
rotulado "(UTC)" e é lido contra as horas do sol).

---

## TODO / Backlog (decidir mais tarde)

- **Painel de FTL / fadiga** (contadores 7/14/28 dias e 12 meses, avisos de
  limite, FDP máximo). _Precisa dos limites reais da Portugália._
- **Lembretes locais (notificações da PWA)** para check-in e documentos a expirar.
- **Componente de vento cruzado** por pista (precisa de BD de pistas).
- **Estimador de ajudas de custo / per diem** (precisa das taxas).

---

_Última atualização: 2026-07-10._
