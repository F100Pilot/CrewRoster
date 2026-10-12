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

### `0.8.17` — mapa em globo

- Alternância **Plano / Globo** no mapa de voos. O globo é uma projeção ortográfica do
  `d3-geo` que já estava no projeto — **zero dependências novas** (o chunk `geo` passou de
  127 para 129,5 KB). Arrastar para rodar, + / − para aproximar, botão para recentrar na
  rede; as rotas seguem a ortodrómica. Afastado, as etiquetas escondem-se para não se
  sobreporem.
- **Plano continua a ser a predefinição** (mais legível para uma rede regional); a
  escolha fica guardada no dispositivo. _A decidir com o utilizador se fica, se passa a
  predefinição, ou se sai._

### `0.8.17.1` — correções

- **OFF fantasma no último dia do período** (ex. 31/10 com OFF + RLIC, quando a
  escala só tem RLIC): a caixa de totais impressa ao lado desse dia ("Off days",
  "Duty time"…) entrava na banda pela margem adaptativa. As sub-colunas com rótulos
  da caixa são agora descartadas. `PARSE_VERSION` → 10: as escalas guardadas são
  relidas sozinhas.
- **Zoom com dois dedos no PDF**: deixa de derivar e de piscar (transform durante o
  gesto, commit síncrono no fim, redesenho fora do ecrã). Deriva do ponto focal
  medida: 12–15 px → 0 px.

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
