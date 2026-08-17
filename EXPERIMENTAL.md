# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.8.14.3`
- **Próxima versão ao promover:** `0.8.15` (ou superior, conforme o âmbito)

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

- **Correção: códigos médicos (IM / VIM / MED) não eram reconhecidos.** Um dia composto só
  por marcações médicas (caso real: 9 Set com IM 07:00-11:00, VIM 11:00-11:30, MED
  11:30-12:00, em três sub-colunas) não produzia qualquer duty e **desaparecia** da escala.
  Novo `dutyType: 'Medical'` no `classifyDuty` (a cor/etiqueta "Médico" já existiam), com
  horas de início/fim (entram no `isTimed`) e entrada na legenda de códigos. `MED` também é
  IATA (Medina), por isso o segmentador só o trata como código quando **não** está dentro de
  um segmento de voo (`AIRPORT_LIKE_DUTY`). Sobe o `PARSE_VERSION` → reprocessa sozinho.

---

## TODO / Backlog (decidir mais tarde)

- **Painel de FTL / fadiga** (contadores 7/14/28 dias e 12 meses, avisos de
  limite, FDP máximo). _Precisa dos limites reais da Portugália._
- **Lembretes locais (notificações da PWA)** para check-in e documentos a expirar.
- **Componente de vento cruzado** por pista (precisa de BD de pistas).
- **Estimador de ajudas de custo / per diem** (precisa das taxas).

---

_Última atualização: 2026-07-10._
