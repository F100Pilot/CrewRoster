# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.8.32.4`
- **Próxima versão ao promover:** `0.8.33` (ou superior, conforme o âmbito)

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

Em `0.8.33` (na exp):

- **Isenção do per diem por dia** (`payEstimate.ts`): substitui a média fixa (88 € IRS / 140 € SS por dia fora). Cada
  dia fora tem o limite nacional ou estrangeiro (toca um aeroporto fora de Portugal), já reduzido por a empresa pagar
  o hotel; o per diem + os abonos RAACO desse dia ficam isentos até ao limite, o resto é tributado com o ordenado
  (fonte: payroll PGA via um colega). Valores por omissão do e-mail do payroll de 2024 (34,60 / 51,90 nacional,
  116,95 / 175,42 estrangeiro; SS = 1,5 × IRS) — outra tabela dava 36,33 / 34,59 e 116,95 / 167,07. Conferido:
  setembro (recibo de outubro) dá 89,50 / 134,25 € por dia vs ~90 / ~135 no recibo. **Por explicar:** agosto (recibo
  de setembro) dá 116,95 / 175,42 (5 dias no estrangeiro, 3 deles ida-e-volta) vs ~86–90 no recibo — regra para dias
  no estrangeiro sem pernoita? Falta o recibo de setembro para conferir.

---

## TODO / Backlog (decidir mais tarde)

- **Abonos RAACO (em produção, experimental):** conferido com maio 2026 (711 € vs 768 €). Por explicar: almoço
  de 39 € num DH LIS→FRA com apresentação 8 min depois do horário (atraso? hora planeada?) e almoço de 18 € num
  RAK→LIS de 1h37 (bloco planeado ≤ 1h30?). Marrocos não está na Tabela 34; falta a nota "Pernoita*". Validar
  com mais extratos (junho/julho) e o feedback dos tripulantes.

- **Do AE SIPLA, ainda por fazer**: estimador de per diem (RRRGS cl. 9, tabela A2.2 —
  aguarda valores confirmados / AE atualizado), créditos de duty-pay/block-pay vs plafonds
  (RRRGS cl. 2/12), mínimo anual de 111 folgas, regime alternativo de 11 dias.
- **Lembretes locais (notificações da PWA)** para check-in e documentos a expirar.
- **Componente de vento cruzado** por pista. _A BD de pistas deixou de ser um bloqueio:
  a `runways.csv` do OurAirports é domínio público e bastam os ~40 aeroportos da rede,
  num JSON pequeno carregado em lazy como o `airportCoordsFallback.json`._

---

_Última atualização: 2026-10-29._
