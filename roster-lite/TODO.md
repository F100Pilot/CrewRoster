# TODO — CrewRoster

Lista de funcionalidades pendentes ou adiadas, por prioridade.

---

## Em espera (trabalho iniciado, suspenso)

### Sincronização Google Calendar
Ficheiros já existentes: `src/components/GoogleCalendarSync.tsx`, `src/utils/googleCalendar.ts`.

O que falta para retomar:
- Testar o fluxo OAuth completo num dispositivo real (Chrome, Android).
- Confirmar que o `Client ID` gerado pelo utilizador no Google Cloud Console aceita a
  origem do GitHub Pages (`https://f100pilot.github.io`).
- Reativar o botão nas Definições (remover do `SettingsDialog` foi temporário).
- Adicionar feedback de progresso mais detalhado (evento a evento).

---

## Novas funcionalidades

### Notificações push de alterações de escala
Quando a escala muda no portal CrewLink, a app devia avisar sem que o utilizador
tenha de abrir o portal. Requer Service Worker com Background Sync e um endpoint
servidor-side (ou Cloudflare Worker com Cron Trigger a fazer polling).

### Partilha de dia / detalhe de voo
A infraestrutura de geração de imagem já existe (`src/utils/shareDay.ts`).
Falta expor o botão "Partilhar" na página de detalhe do dia e testar no iOS (Web Share API).

### Suporte a outros operadores / layouts de PDF
O parser `pgaGrid.ts` está calibrado para a Portugália (NetLine). Outros operadores
com o mesmo sistema (PolyNesian, Air Nostrum…) podem ter colunas ligeiramente diferentes.
Criar perfis adicionais em `src/parsing/pdf/profiles/` quando houver amostras.

### Alertas de validade de documentos
A página Documentos mostra a validade mas não avisa. Adicionar notificação local
(Notification API) X dias antes do vencimento de cada documento.

### Histórico de escalas
Guardar as últimas N escalas importadas em vez de apenas a atual, para poder
comparar escalas de meses diferentes ou restaurar uma versão anterior.

### Tema de cores personalizável
Atualmente a cor de acento é fixa (azul PGA). Deixar o utilizador escolher uma cor
primária diferente (guardada em `localStorage`).

---

## Melhorias conhecidas / refinamentos

- **Parser PDF — dias com vários voos**: números de voo de 4 dígitos (ex. `1454`)
  podem colidir com horas; o parser pode confundir um com o outro. Refinar a
  heurística em `pgaGrid.ts` quando houver mais amostras.
- **Mapa de voos**: mostrar etiquetas de ICAO nos aeroportos com menos de N voos
  (atualmente só aparece o código quando o aeroporto tem espaço).
- **Calendário — arrastar para mudar mês**: o swipe horizontal já funciona na página
  de detalhe do dia; replicar no calendário.
- **Logbook — exportação CSV**: permitir exportar o diário de bordo para Excel/CSV.
- **Estatísticas — evolução mensal**: gráfico de barras com o total de horas de bloco
  por mês (atualmente só mostra totais acumulados).
- **AeroDataBox — cache de matrículas**: as matrículas capturadas ficam no IndexedDB
  mas o cache expira ao fim de 7 dias; avaliar se convém aumentar para 30 dias.
