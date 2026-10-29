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

### `0.8.18.4` — horas das sessões em terra em hora local

- No detalhe do dia, o Início/Fim de formação, simulador, gabinete, serviço externo e médicas
  passa a mostrar a **hora local** do aeroporto, com o **UTC entre parênteses** por baixo —
  igual aos voos (STD/STA). Sem fuso conhecido, fica só o UTC.

### `0.8.19` — Conformidade AE e contador de férias (experimental)

- **Painel "Conformidade AE"** (pilotos, na lista): a escala a partir deste mês contra o
  RUPT — folgas no mês ≥10, reduzidas 2 por 7 dias de ausência/férias (cl. 21.2, 21.14–15);
  ≤6 dias entre períodos de folga de ≥48h (21.3); 2×72h ou 1×96h nos meses com 10 (21.4);
  sábado+domingo de folga a cada 6 semanas, suspenso por férias (21.8); descanso semanal de
  36h com 2 noites locais, a começar até às 14:00 do 6.º dia (15.2); ES/LF/ND ≤2 seguidos e
  ≤3 entre folgas, 3 ES seguidos se cercados por folgas (22). Lógica em
  `src/domain/aeCompliance.ts`. Só julga dias cobertos pela escala importada; dias sem
  registo quebram a contagem.
- **Chips Early Start / Late Finish / Night Duty** no detalhe do dia (hora da base; ES =
  05:00–06:29 como na cl. 22.7).
- **Contador de férias** nas Estatísticas: PLIC/SLIC/RLIC do ano vs 42 (cl. 38), F à parte.
- **Aviso "experimental"** em tudo o que vem do AE (cartões Limites AE, Conformidade e Férias;
  dicas do FDP, do descanso e dos ES/LF/ND) — texto único em `AeDisclaimer.tsx`.
- Decisões: "dia de folga" = W_OFF / OFF / *_RQST (PLS_* e X não contam, def. 11); um dia de
  folga isolado não é "período de folga" (def. 27, ≥48h); não se modelam o regime alternativo
  de 11 dias (21.5) nem as exceções por irregularidade.

### `0.8.19.1` — página "Limites e AE"

- Os cartões **Limites**, **Conformidade AE** e **Férias** saem da lista e das Estatísticas para
  uma página própria, **`/limites` — "Limites e AE"** (pilotos; "Limites" para cabina), com o
  aviso experimental uma vez no topo. Acesso pela linha de resumo na lista e pelo menu ⋮.
- **Linha de resumo** na lista (`LimitsSummaryCard`): o valor mais perto do limite + nº de pontos
  do AE a verificar; barra lateral verde / laranja / vermelha. Mesmos números da página
  (`src/domain/limitRows.ts`, partilhado).
- Cláusula de cada verificação passa a aparecer na própria linha (no telemóvel não há hover).
- Correção: hora de Lisboa nos dias de mudança de hora (meia-noite local e a hora repetida).
- Por confirmar com o utilizador: o aviso de descanso semanal 25–30/10 na escala real vem de 6
  dias seguidos de S.EXT. (fim às 16:00 do 6.º dia, depois das 14:00 da cl. 15.2).

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
