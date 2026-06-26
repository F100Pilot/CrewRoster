# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.8.8`
- **Próxima versão ao promover:** `0.8.9` (ou superior, conforme o âmbito)

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

### Matrícula via FLIC no próprio dia
No dia do voo, a **matrícula** passa a vir da board do FLIC (campo `TD_AIRC_REG`,
ex.: `CSTPW` → `CS-TPW`) — a fonte operacional mais atual (reflete trocas de
aeronave de última hora antes do AeroDataBox, e funciona **sem chave**). É
gravada no diário de bordo e tem prioridade na apresentação. As boards do FLIC
passaram a ter uma **cache curta** (45s) para o cartão do stand e a procura de
matrícula partilharem um único pedido (o refresh manual ignora a cache).

- **Ficheiros:** `roster-lite/src/domain/flic.ts` (`normalizeReg`, `fetchFlicReg`,
  cache), `roster-lite/src/domain/aircraftRegs.ts` (`recordRegValue`),
  `roster-lite/src/components/FlightInfo.tsx`, `roster-lite/src/components/FlicStand.tsx`,
  `roster-lite/src/__tests__/flic.test.ts`.
- **Testar:** (no dia do voo) abrir um voo LIS/OPO → a matrícula aparece com a
  nota "via FLIC (atualizada no dia)"; confirmar que fica no diário de bordo.

---

## TODO / Backlog (decidir mais tarde)

- **Painel de FTL / fadiga** (contadores 7/14/28 dias e 12 meses, avisos de
  limite, FDP máximo). _Precisa dos limites reais da Portugália._
- **Lembretes locais (notificações da PWA)** para check-in e documentos a expirar.
- **Componente de vento cruzado** por pista (precisa de BD de pistas).
- **Estimador de ajudas de custo / per diem** (precisa das taxas).

---

_Última atualização: 2026-06-25._
