# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.8.17.1`
- **Próxima versão ao promover:** `0.8.18` (ou superior, conforme o âmbito)

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

### `0.8.18` — limites do Acordo de Empresa SIPLA (pilotos) e FDP máximo

Fonte: AE Portugália/SIPLA 2023 — RUPT e RRRGS (fornecidos pelo utilizador; o texto **não**
está no repositório, só os valores, com a cláusula ao lado no código) — e a nota da DOV
"Netline | Atualização sobre Novos Códigos" (14/02/2025) para os horários das assistências.

- **Painel "Limites AE"** (pilotos): voo 90h/4 semanas, 270h/trimestre, 850h/ano, simulador
  incluído (RUPT cl. 30); serviço 50h/7 dias, 180h/28, 480h/trimestre, 1800h/ano (cl. 31).
  Cabine mantém EASA (o AE SIPLA só cobre pilotos).
- **Contagem do serviço**: +30 min de debriefing após o último setor (cl. 6 def. 42);
  assistência em casa 25% (H-codes, duração pela tabela da DOV), no aeroporto 50%, R24 não
  conta (cl. 19.7, 20.4). Corrige: as assistências em casa nunca contavam (a escala só traz o
  início).
- **FDP máximo** no detalhe do dia (cl. 35.1, hora de Lisboa × setores; cl. 35.3 fora da base
  22:00–06:00 → 6h/9h).
- **Descanso mínimo do AE** (cl. 25/34): 12h base / 10h fora / 9h antes de solo, ou a duração do
  serviço anterior; +2h se tocou 02:00–05:59 Lisboa.
- Decisões: "mês" = 4 semanas e "ano" = 52 semanas (cl. 6 def. 20 e 2); trimestre = civil,
  o mais pesado a partir do atual.

### `0.8.18.1` — base do piloto e legenda de códigos

- **Definições → Base (Lisboa / Porto)**, guardada no perfil (`UserProfile.base`, omissão
  `LIS`). Entra no descanso (base vs fora), na regra do FDP fora da base (cl. 35.3) e nas
  noites fora das estatísticas do mês. Ambas em Europe/Lisbon, por isso a hora de referência
  não muda.
- **Legenda corrigida**: PLIC / SLIC / RLIC = férias (dias de calendário), F = férias em atraso
  (dias úteis) — o RLIC aparecia como "licença de casamento". H = assistência em casa
  (pilotos), A = cabina, R24 = reserva de 24h, SBY = assistência no aeroporto.

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
