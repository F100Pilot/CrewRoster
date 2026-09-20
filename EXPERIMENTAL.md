# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.8.16`
- **Próxima versão ao promover:** `0.8.17` (ou superior, conforme o âmbito)

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

_(Vazio — tudo o que estava pendente foi promovido em `0.8.16`.)_

---

## TODO / Backlog (decidir mais tarde)

- **FDP máximo do dia** (ORO.FTL.205: hora de apresentação × nº de setores), para
  mostrar a margem que resta quando o dia derrapa. É tabela do regulamento; a parte
  difícil é a aclimatação. _O resto do painel de FTL — limites de tempo de voo e de
  serviço 7/14/28 dias, com aviso de pico — já foi enviado em `0.8.16`._
- **Lembretes locais (notificações da PWA)** para check-in e documentos a expirar.
- **Componente de vento cruzado** por pista. _A BD de pistas deixou de ser um bloqueio:
  a `runways.csv` do OurAirports é domínio público e bastam os ~40 aeroportos da rede,
  num JSON pequeno carregado em lazy como o `airportCoordsFallback.json`._
- **Estimador de ajudas de custo / per diem** (precisa das taxas da PGA — bloqueado).
- **Percentagem da reserva em casa** no cálculo do tempo de serviço: está a 25%
  (`HOME_STANDBY_FACTOR` em `src/domain/dutyTime.ts`), o valor habitual do ORO.FTL.225.
  Confirmar contra o acordo da Portugália.

---

_Última atualização: 2026-09-20._
