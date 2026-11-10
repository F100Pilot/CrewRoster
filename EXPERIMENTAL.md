# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.8.29.4`
- **Próxima versão ao promover:** `0.8.30` (ou superior) (ou superior, conforme o âmbito)

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

Em `0.8.30` (na exp):

- **Tempo no céu do banner** (`SkyWeather.tsx`, `domain/skyWeather.ts`, `state/useCurrentWeather.ts`): o tempo
  atual (Open-Meteo `current`, cache 15 min) no aeroporto onde o tripulante está pela escala — sol, lua na fase
  real, nuvens, chuva, neve, nevoeiro, trovoada (animação desligada com `prefers-reduced-motion`). Temperatura e
  estado no topo do "Hoje" e ao lado da etiqueta do `PageHero`. Sem rede, o céu fica só com a hora do dia.

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
