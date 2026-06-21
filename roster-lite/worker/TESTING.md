# Testar o worker — notificação CrewLink

## Problema

Quando existe uma notificação por ler no CrewLink para o período pedido, o servidor
devolve a mensagem:

> "There is a notification for the period, for which you want to retrieve the duty
> plan. Get it before you retrieve the duty plan."

O worker tenta limpar a notificação automaticamente, mas precisa de saber o pedido
HTTP exato que o site faz quando clicas "OK" / "Confirmar".

---

## O que é preciso capturar

### Opção A — Capturar o pedido HTTP manualmente (método preferido)

1. Abre `netline.pga.pt` num browser normal (Chrome ou Firefox).
2. Abre **DevTools → aba Network** (F12 → Network). Activa "Preserve log".
3. Faz login e tenta abrir a escala até aparecer o banner/interstitial da notificação.
4. Clica no botão de confirmação (OK / Confirmar / Aceitar).
5. No painel Network, localiza o pedido que foi disparado nesse clique.
6. Copia e partilha:
   - **URL completo** (ex: `https://netline.pga.pt/pav/b2c?op=getNotification&…`)
   - **Método** (GET ou POST)
   - Se for POST: o conteúdo de **Form Data** (aba "Payload" no Chrome / "Request" no Firefox)

Com essa informação o worker pode reproduzir o mesmo pedido e limpar a notificação
sem intervenção manual.

---

### Opção B — Ler o trail do worker (diagnóstico rápido)

Se o download falhar com o erro de notificação, o worker escreve um array `trail`
na consola. Para o ver:

1. Abre a app (`https://f100pilot.github.io/CrewRoster/`).
2. Abre **DevTools → aba Console** (F12 → Console).
3. Tenta descarregar a escala (botão ☁️ no canto superior direito).
4. Quando aparecer o erro, procura a linha `trail:` na consola e expande o array.
5. Partilha o conteúdo completo — cada entrada tem `step`, `via`, `status` e `ok`,
   o que indica quais tentativas de notificação foram feitas e qual o resultado HTTP.

---

## Após obter os dados

Abre uma issue ou partilha os dados directamente. Com o URL + método + form data
corretos, a correcção no `worker.js` é imediata e o download volta a funcionar
sem ter de abrir o CrewLink manualmente.
