# Distribuição como APK (Android)

O CrewRoster é uma **PWA**. Para a distribuir como **APK** não se reescreve nada: embrulha-se
a PWA numa **TWA (Trusted Web Activity)** — um APK fino que abre o site alojado em ecrã
inteiro, sem barra de endereço. É exatamente como muitas PWAs chegam à Play Store.

A app já cumpre os requisitos: HTTPS, service worker, e um `manifest.json` completo com
`id`, `scope`, `start_url` e ícones `any` + `maskable`.

---

## Caminho A — PWABuilder (recomendado, sem instalar nada)

1. Abre **https://www.pwabuilder.com**.
2. Cola o URL: `https://f100pilot.github.io/CrewRoster/`
3. Carrega em **Package For Stores → Android**.
4. Escolhe o formato:
   - **APK** — para instalares/distribuíres o ficheiro diretamente.
   - **AAB** — só se fores publicar na Google Play.
5. Faz **Download**. O PWABuilder gera também uma **keystore** (guarda-a! é com ela que
   assinas TODAS as atualizações futuras) e mostra-te a **impressão digital SHA-256** da
   assinatura — guarda esse valor para o passo dos *Digital Asset Links* abaixo.

Resultado: um APK assinado, instalável em qualquer Android (Definições → permitir
instalação de fontes desconhecidas).

---

## Caminho B — Bubblewrap (linha de comandos)

Precisa de **JDK 17+** e do **Android SDK** instalados.

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://f100pilot.github.io/CrewRoster/manifest.json
bubblewrap build       # gera app-release-signed.apk + a keystore
```

O `bubblewrap init` faz perguntas (nome do pacote, ex. `pt.crewroster.app`) e cria/usa
uma keystore. `bubblewrap build` produz o APK assinado.

---

## Digital Asset Links — tirar a barra de endereço (verificação do domínio)

Para a TWA abrir **sem** a barra de endereço, o **domínio** tem de "confirmar" o APK,
servindo um ficheiro em:

```
https://<domínio>/.well-known/assetlinks.json
```

com o nome do pacote e a **SHA-256** da tua keystore (a que o PWABuilder/Bubblewrap mostrou):

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "pt.crewroster.app",
    "sha256_cert_fingerprints": ["<COLOCA-AQUI-A-SHA256-DA-TUA-KEYSTORE>"]
  }
}]
```

### ⚠️ Limitação importante neste alojamento (github.io em subpasta)

O site está em `f100pilot.github.io/**CrewRoster**/` (página de projeto). Mas a verificação
exige o ficheiro na **raiz do domínio**:
`https://f100pilot.github.io/.well-known/assetlinks.json` — que pertence ao repositório
`f100pilot.github.io` (a página de utilizador), **não** a este repo. Opções:

- **(Melhor) Domínio próprio** — apontar um domínio (ex. `crewroster.pt`) para o GitHub
  Pages. Aí o `assetlinks.json` fica na raiz desse domínio (servido por este repo) e a
  verificação funciona. Também encurta o URL.
- **Criar o repo `f100pilot.github.io`** e lá colocar `/.well-known/assetlinks.json`.
- **Sem verificação** — o APK na mesma funciona, mas pode mostrar uma pequena barra com o
  endereço no topo. Aceitável para distribuição interna, menos polido.

---

## Atualizações

- O **conteúdo** da app atualiza-se sozinho (a TWA carrega sempre o site mais recente via
  service worker) — não é preciso reinstalar o APK a cada versão.
- Só voltas a gerar/distribuir o APK se mudares **ícone**, **nome**, **package** ou a
  configuração da própria TWA. Assina sempre com a **mesma keystore**.

## Resumo

| | Esforço | Resultado |
|---|---|---|
| **PWABuilder** | 5 min, sem instalar nada | APK/AAB assinado |
| **Bubblewrap** | precisa de JDK + Android SDK | APK assinado via CLI |
| **Verificação (sem barra)** | requer assetlinks na raiz do domínio | recomendado domínio próprio |
