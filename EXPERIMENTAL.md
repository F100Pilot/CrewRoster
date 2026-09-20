# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.8.15.6`
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

### `0.8.16` — limites de serviço e recência noturna

- **Limites de serviço (ORO.FTL.210)** no painel de limites, ao lado do tempo de voo:
  60h/7 dias, 110h/14 e 190h/28. Cada barra é a **pior janela** de dias consecutivos da
  escala, dias futuros incluídos. O serviço conta da apresentação à última chegada; um
  dia só de reserva em casa conta a 25% (`HOME_STANDBY_FACTOR` em `dutyTime.ts` — é o
  único número aqui que outro operador pode definir de forma diferente).
- **Recência noturna** na página Documentos, a par da recência de aterragens.
  Informativa: o FCL.060(b)(2) dispensa quem tem IR válido.
- **Correção — descanso entre serviços**: um voo que terminava depois da meia-noite
  fechava o período de serviço cedo demais e inflacionava o descanso seguinte (14h em
  vez de 10h30 no caso testado). `restPeriods.ts` e `dutyTime.ts` passam a partilhar a
  mesma janela de serviço.

---

## TODO / Backlog (decidir mais tarde)

- **Painel de FTL / fadiga** (contadores 7/14/28 dias e 12 meses, avisos de
  limite, FDP máximo). _Precisa dos limites reais da Portugália._
- **Lembretes locais (notificações da PWA)** para check-in e documentos a expirar.
- **Componente de vento cruzado** por pista (precisa de BD de pistas).
- **Estimador de ajudas de custo / per diem** (precisa das taxas).

---

_Última atualização: 2026-07-10._
