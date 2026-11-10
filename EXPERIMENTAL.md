# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.8.31.1`
- **Próxima versão ao promover:** `0.8.32` (ou superior, conforme o âmbito)

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

Em `0.8.32` (na exp):

- **Abonos RAACO** (ROV-PGA 4.5, Rev. 01; Anexo 7.6 Tabelas 32–34) — `domain/raaco.ts` (+ testes), página `/abonos`
  (menu "⋮", no formato do extrato "Abonos Operacionais") e cartão "Refeições · RAACO" no Dia. Pilotos e cabine.
  Calibrado pelo padrão de um extrato real: estadia paga almoço, jantar e ceia à Tabela 34 + pernoita, o
  pequeno-almoço do hotel não; Tabela 33 (5 € / 18 €, valor local no início de pernoita) para refeições não
  embarcáveis (setores ≤ 1h30, 2.ª refeição em voo < 5h); refeição devida na estadia e no PSV de regresso é paga
  na estadia. **Por confirmar com a escala do mesmo mês:** um pequeno-almoço de 22 € no dia de ida para FRA.
  Marrocos não está na Tabela 34. Não entra no Vencimento (é pago à parte).
- `0.8.32.1`: conferido com a escala real de maio contra o extrato (711 € vs 768 €; 9 de 11 linhas ao cêntimo).
  DHC pago (Tabela 34 local se acaba fora da base, Tabela 33 se regressa — 22 € PA DH→FRA, 18 € jantar DH→LIS);
  embarque só num setor que voe no horário da refeição (ou o 1.º setor, se o PSV começa no horário); horas
  planeadas (`ParsedDuty.planned`) quando conhecidas. **Diferenças por explicar:** almoço de 39 € num DH LIS→FRA
  com apresentação às 14:08 LT (fora do horário em hora local — horário planeado anterior? ou leitura em UTC?) e
  almoço de 18 € num RAK→LIS de 1h37 de bloco (bloco planeado ≤ 1h30?). Leitura em UTC testada e posta de
  parte (resolve o DH mas cria uma ceia num início às 04:38z e perde os almoços de regresso): fica hora local.
- `0.8.32.2`: num dia voado com plano conhecido, `reportingTime` = apresentação planeada (`rosterMerge`) — o PDF não
  traz apresentação, o parser deriva-a (1.ª partida − 1h) e depois do voo seguia a partida real. Afeta FDP, descanso,
  planeado vs realizado (FDP extra passa a contar o atraso à partida) e abonos. `PARSE_VERSION` 15 (re-parse).
- `0.8.32.3`: Abonos com ícone próprio na AppBar (Restaurant), à esquerda do "⋮"; saiu do menu.

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
