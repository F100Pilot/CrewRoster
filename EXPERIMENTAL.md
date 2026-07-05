# EXPERIMENTAL — alterações pendentes para produção

Registo do que **já está na branch experimental** (`claude/crew-per-flight`,
preview em <https://f100pilot.github.io/CrewRoster/exp/>) mas **ainda não foi
promovido para `master`/produção** (<https://f100pilot.github.io/CrewRoster/>).

Serve para **juntar várias alterações** e depois fazer **um único deploy** para
produção, em vez de promover uma a uma.

- **Produção (`master`) está em:** `0.8.11.5`
- **Próxima versão ao promover:** `0.8.12` (ou superior, conforme o âmbito)

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

- **Onde está a aeronave (mapa ao vivo):** no dia do voo e antes da partida, o detalhe
  do voo mostra num mini-mapa a posição ao vivo da aeronave que vais voar, no ar (rumo,
  FL, velocidade, distância ao aeroporto) **ou já no solo** (com destaque quando já está
  no teu aeroporto de partida). Fonte:
  ADS-B aberto (airplanes.live/adsb.lol) via novo endpoint `POST /api/acpos` no worker.
  - **⚠️ Worker alterado** (`worker.js`): o `/api/acpos` só fica disponível depois de
    republicar o worker. Como o deploy automático do worker só corre no `master`, é
    preciso **disparar `deploy-worker.yml` manualmente na ref `claude/crew-per-flight`**
    para testar no exp (o worker é partilhado por prod e exp). Ao promover para `master`,
    o worker republica-se sozinho.

---

## TODO / Backlog (decidir mais tarde)

- **Painel de FTL / fadiga** (contadores 7/14/28 dias e 12 meses, avisos de
  limite, FDP máximo). _Precisa dos limites reais da Portugália._
- **Lembretes locais (notificações da PWA)** para check-in e documentos a expirar.
- **Componente de vento cruzado** por pista (precisa de BD de pistas).
- **Estimador de ajudas de custo / per diem** (precisa das taxas).

---

_Última atualização: 2026-07-04._
