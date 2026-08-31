# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.8.15.3`
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

- **Novos códigos de simulador (EBT).** Desde Set/2026 o simulador de LIS usa `LIS-EBT-1`,
  `LIS-EBT-2` e `LIS-OTHER` em vez de `E90-LIS-1`. Não classificados, o dia caía no fallback
  genérico que apanhava o `E90` como código → "E90 · Other" com o início da sessão lido como
  check-in. Reconhecidos agora como `Simulator` em `classifyDuty` (padrão `[A-Z]{3}-(EBT-\d|OTHER)`,
  aceitando outra base) e no `GROUND_CODE` do `crewInfo` — senão a tripulação da sessão também
  não era atribuída. Sobe `PARSE_VERSION` e `CREW_PARSER_VERSION` → reprocessa sozinho.

---

## TODO / Backlog (decidir mais tarde)

- **Painel de FTL / fadiga** (contadores 7/14/28 dias e 12 meses, avisos de
  limite, FDP máximo). _Precisa dos limites reais da Portugália._
- **Lembretes locais (notificações da PWA)** para check-in e documentos a expirar.
- **Componente de vento cruzado** por pista (precisa de BD de pistas).
- **Estimador de ajudas de custo / per diem** (precisa das taxas).

---

_Última atualização: 2026-07-10._
