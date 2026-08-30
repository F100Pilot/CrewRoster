// Single source for the app's display name and version, shown in the header, the welcome
// screen and the shared-day image.
//
// Versioning — 0.8.<centesimal>[.<milésima>]:
//   • new features → bump the CENTESIMAL (3rd part): 0.8.2 → 0.8.3
//   • small fixes  → bump the MILÉSIMA (4th part):   0.8.2 → 0.8.2.1
// Add a RELEASE_NOTES entry for every bump so the "Novidades" pop-up can announce it.
export const APP_NAME = 'CrewRoster';
export const APP_VERSION = '0.8.15.3';
export const APP_STAGE = 'Beta';
export const APP_VERSION_LABEL = `${APP_VERSION} ${APP_STAGE}`;

export interface ReleaseNote {
  version: string;
  date: string; // YYYY-MM-DD
  highlights: string[];
}

// Newest first.
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.8.15.3',
    date: '2026-08-22',
    highlights: [
      'Sincronizar a escala deixa de avisar “dias mudaram” por causa de voos já realizados. Como o download abrange também a semana anterior (para o Diário receber as horas reais), esses acertos apareciam como alterações — agora só contam as mudanças de hoje em diante.',
    ],
  },
  {
    version: '0.8.15.2',
    date: '2026-08-22',
    highlights: [
      '“Onde está a aeronave” deixa de ser invisível: nos voos de hoje ainda por partir o painel aparece sempre, no detalhe do voo. Quando não há posição, diz porquê — matrícula ainda desconhecida, ou aeronave não captada neste momento — com um botão para atualizar. Antes desaparecia em silêncio e ninguém o encontrava.',
    ],
  },
  {
    version: '0.8.15.1',
    date: '2026-08-21',
    highlights: [
      'Correção: no telemóvel o nome “CrewRoster” aparecia cortado (“CrewRos…”) — havia ícones a mais na barra. A legenda de códigos e o terminar sessão passaram para um menu “⋮”, e o nome volta a aparecer completo.',
    ],
  },
  {
    version: '0.8.15',
    date: '2026-08-17',
    highlights: [
      'Sincronizar a escala passa a atualizar os voos já realizados: o download começa por omissão 7 dias atrás, por isso os setores voados recentemente recebem as horas finais e o Diário fica com elas (podes sempre mudar a data de início).',
      'Marcar quem foi PF (descolagem/aterragem) deixa de congelar o setor — as horas continuam a ser atualizadas pela escala. Só alterar os dados do voo à mão é que o protege de futuras sincronizações.',
    ],
  },
  {
    version: '0.8.14.4',
    date: '2026-08-16',
    highlights: [
      'Correção: os dias de inspeção/exames médicos desapareciam da escala — os códigos IM, VIM e MED não eram reconhecidos. Passam a aparecer como “Médico”, com o local e as horas de cada marcação. As escalas já importadas reprocessam sozinhas.',
    ],
  },
  {
    version: '0.8.14.3',
    date: '2026-08-04',
    highlights: [
      'Caderneta EASA: os simuladores passam a aparecer como linhas na própria tabela dos voos, por ordem cronológica (marcados como “Simulador”), em vez de numa tabela à parte. O tempo de simulador não conta para os totais de voo — é somado à parte (“FSTD”).',
    ],
  },
  {
    version: '0.8.14.2',
    date: '2026-07-18',
    highlights: [
      'Caderneta EASA: a coluna “Nome PIC” passa a mostrar o Comandante do voo — o teu nome quando voas como Comandante, ou o nome do Comandante quando voas como Oficial Piloto (obtido da lista de tripulação). Antes mostrava sempre “SELF”.',
    ],
  },
  {
    version: '0.8.14.1',
    date: '2026-07-18',
    highlights: [
      'Correção: em alguns voos a tripulação não aparecia porque um pedaço de nome (3 letras, ex.: “RUI”) era lido como o aeroporto de chegada. O destino do voo passa a ser lido corretamente e a tripulação volta a aparecer. As escalas já importadas atualizam-se sozinhas.',
    ],
  },
  {
    version: '0.8.14',
    date: '2026-07-17',
    highlights: [
      'Leitura da escala mais robusta: a margem de leitura de cada dia ajusta-se sozinha ao número de voos, evitando de vez que um voo desapareça em dias com vários voos.',
      'Rede de segurança: a app compara cada dia com o resumo “Individual duty plan” do próprio PDF e assinala (⚠ verificar) se parecer faltar um voo, em vez de o mostrar em falta em silêncio.',
    ],
  },
  {
    version: '0.8.13.2',
    date: '2026-07-17',
    highlights: [
      'Correção: um voo do último dia de um bloco da escala podia desaparecer quando o dia tinha 3+ voos (ex.: LIS-OPO-LIS e depois LIS-SVQ a 30 Jul). O leitor do PDF passa a ler todos os voos desse dia. As escalas já importadas reprocessam sozinhas.',
    ],
  },
  {
    version: '0.8.13.1',
    date: '2026-07-10',
    highlights: [
      'Caderneta EASA imprimível: passa a ter as colunas de Descolagens e Aterragens (dia/noite), contando só as que voaste como PF, com subtotais por página e totais acumulados.',
    ],
  },
  {
    version: '0.8.13',
    date: '2026-07-05',
    highlights: [
      'Diário de bordo: em cada setor podes definir quem fez a descolagem e a aterragem (Eu / Colega) ao editar. A app calcula sozinha se cada uma foi de dia ou de noite (nascer/pôr do sol) e mostra-o na linha do voo.',
      'Totais como PF: descolagens e aterragens, dia e noite, contando só as que voaste. O export CSV passa a incluir descolagem dia/noite além da aterragem.',
    ],
  },
  {
    version: '0.8.12.2',
    date: '2026-07-05',
    highlights: [
      'Mapa da aeronave: mostra agora a ETA estimada até ao teu aeroporto (quando vem a caminho) e se está a subir, em cruzeiro ou a descer.',
    ],
  },
  {
    version: '0.8.12.1',
    date: '2026-07-05',
    highlights: [
      'Mapa da aeronave: passa a mostrar também quando a aeronave já aterrou (no solo), e destaca quando já está no teu aeroporto de partida.',
    ],
  },
  {
    version: '0.8.12',
    date: '2026-07-04',
    highlights: [
      'Onde está a aeronave: no dia do voo e antes de partires, o detalhe do voo mostra num mini-mapa a posição ao vivo da aeronave que vais voar, enquanto ela ainda está no ar (rumo, nível de voo, velocidade e distância ao teu aeroporto). Usa dados ADS-B abertos; só aparece quando a aeronave está a ser captada.',
    ],
  },
  {
    version: '0.8.11.5',
    date: '2026-07-04',
    highlights: [
      'Caderneta EASA no telemóvel: a tabela deixa de cortar as células — mostra-se à largura toda com deslize horizontal e texto maior. Ao imprimir/guardar em PDF continua a caber na folha A4.',
    ],
  },
  {
    version: '0.8.11.4',
    date: '2026-07-03',
    highlights: [
      'Diário de bordo: cabeçalho mais limpo — o título deixa de se partir em várias linhas e as ações (Adicionar / CSV / EASA) ficam alinhadas por baixo.',
    ],
  },
  {
    version: '0.8.11.3',
    date: '2026-07-03',
    highlights: [
      'Tripulação do simulador agora reconhecida corretamente (a secção “Crew Information on Ground Activity” é lida como grelha transposta, tal como a dos voos). As escalas já importadas reprocessam sozinhas.',
    ],
  },
  {
    version: '0.8.11.2',
    date: '2026-07-03',
    highlights: [
      'Sessão de simulador mostra agora o Início/Fim (UTC) e o local, além do check-in, e a tripulação escalada. As escalas já importadas reprocessam sozinhas.',
    ],
  },
  {
    version: '0.8.11.1',
    date: '2026-07-03',
    highlights: [
      'Correção: a tripulação escalada para o simulador passa a aparecer mesmo quando a sessão só traz o check-in (sem horas de início/fim).',
    ],
  },
  {
    version: '0.8.11',
    date: '2026-07-03',
    highlights: [
      'Tripulação escalada para o simulador: ao abrir um dia com sessão de Simulador/Formação, vês a tripulação do evento (com quem estás escalado), com função e toque para ver os voos partilhados. As escalas já importadas reprocessam sozinhas.',
      'Caderneta EASA: nova secção FSTD (dispositivos de treino de simulação) na folha imprimível, com data, tipo de FSTD, duração e total.',
    ],
  },
  {
    version: '0.8.10',
    date: '2026-06-28',
    highlights: [
      'Caderneta de voo EASA imprimível: no Diário, botão “EASA” → folha formatada (uma linha por setor, com subtotais por página e totais acumulados) → Imprimir / Guardar como PDF.',
      'Define a tua função (Comandante / Oficial Piloto) em Definições → Caderneta de voo (EASA); o tempo de bloco vai para essa coluna.',
    ],
  },
  {
    version: '0.8.9.6',
    date: '2026-06-27',
    highlights: [
      'Stand do FLIC: passa a indicar se é a Chegada ou a Partida (e o aeroporto), além do número — antes ficava ambíguo.',
    ],
  },
  {
    version: '0.8.9.5',
    date: '2026-06-27',
    highlights: [
      'Estatísticas, Mapa e Documentos passam a aparecer logo após importar a escala, sem ser preciso abrir o Diário primeiro.',
      'Reconhecido o código FAL(PD) (Falta com motivo): o dia deixa de ser ignorado e aparece como Falta. As escalas já importadas reprocessam sozinhas.',
      'Heatmap de atividade: passa a mostrar também as Faltas, a vermelho.',
    ],
  },
  {
    version: '0.8.9.4',
    date: '2026-06-27',
    highlights: [
      'Heatmap de atividade: além dos voos, mostra os dias de Simulador (laranja), Formação (teal) e Gabinete (roxo), cada um com a sua cor. O tipo de cada dia aparece ao tocar.',
    ],
  },
  {
    version: '0.8.9.3',
    date: '2026-06-27',
    highlights: [
      'Login automático ao CrewLink mais fiável: passa a funcionar mesmo quando a password é preenchida por um gestor de passwords (ex.: Bitwarden). Antes podia ficar por guardar e o formulário aparecia na mesma.',
      'Mensagem mais clara quando as portas/matrícula não aparecem: indica que vêm do AeroDataBox e que a chave é por dispositivo (Definições).',
    ],
  },
  {
    version: '0.8.9.2',
    date: '2026-06-27',
    highlights: [
      'Turbulência da rota recalibrada: deixa de marcar “elevada” numa travessia normal de jato (estava demasiado sensível). Os níveis ficam alinhados com os produtos de EDR, como a carta de turbulência (CAT) do Windy ao lado.',
    ],
  },
  {
    version: '0.8.9.1',
    date: '2026-06-27',
    highlights: [
      'Correção: um voo que ainda não partiu deixa de mostrar estados impossíveis (ex.: “Arrived”), e a matrícula/portas deixam de vir de uma operação de outro dia do mesmo voo. Sem dados disponíveis, fica uma indicação clara em vez de campos vazios.',
    ],
  },
  {
    version: '0.8.9',
    date: '2026-06-26',
    highlights: [
      'Matrícula da aeronave pelo FLIC no próprio dia do voo (LIS/OPO): mais atual (reflete trocas de última hora), funciona sem chave e fica registada no diário de bordo.',
      'Heatmap de atividade mais legível: meses e dias da semana identificados, grelha visível e toca num dia para veres a data e o bloco.',
    ],
  },
  {
    version: '0.8.8',
    date: '2026-06-25',
    highlights: [
      'Stand ao vivo (FLIC TAP): nos voos de/para Lisboa e Porto, o stand real aparece no banner no próprio dia.',
      'METAR/TAF descodificado na Meteo da rota, com categoria de voo (VFR/MVFR/IFR/LIFR) a cores.',
      'Nascer/pôr do sol e tempo noturno por setor, com barra dia/noite no banner do voo.',
      'Diário de bordo: tempo noturno por setor e exportação CSV no estilo EASA (IFR, noite, aterragens dia/noite).',
      '“Com quem voo”: toca num tripulante para ver todos os voos partilhados com esse colega.',
      'Pesquisa global (lupa no topo): voos, aeroportos, rotas, colegas, tipo de serviço e datas.',
      'Estatísticas: mapa de atividade anual (heatmap). Calendário: partilhar o mês como imagem.',
      'Login automático ao CrewLink quando há credenciais guardadas, com confirmação ao guardar/remover.',
      '⚠️ A tripulação por voo continua EM TESTES — confirma sempre na escala oficial do CrewLink (separador “PDFs”).',
    ],
  },
  {
    version: '0.8.7',
    date: '2026-06-25',
    highlights: [
      'Turbulência mais precisa: estimada em vários pontos da rota com o índice de Ellrod (shear + deformação), além do CAPE.',
      'Meteo da rota: o mapa passa a mostrar a camada de turbulência (CAT) ao nível de cruzeiro.',
      'O aviso de versão beta aparece sempre até marcares “Tomei conhecimento. Não voltar a mostrar o aviso.”.',
    ],
  },
  {
    version: '0.8.6',
    date: '2026-06-24',
    highlights: [
      'Tripulação por voo mais completa: Comandantes e Chefe de Cabine corretos, e os voos de regresso (mesmo no dia seguinte) já mostram a tripulação.',
      'A tua própria entrada deixa de aparecer na lista de tripulação.',
      'Definições → Acesso ao CrewLink: guarda o código de tripulante e password para preencherem automaticamente o download da escala.',
      'Mapa: base de dados mundial de aeroportos — qualquer destino passa a ser desenhado.',
      'Ao abrir, a escala é reprocessada automaticamente com as últimas melhorias, sem voltares a descarregar.',
      'Aviso de versão beta ao abrir e sempre em Definições → Sobre: em caso de dúvida, confirma na escala oficial (separador “PDFs”).',
    ],
  },
  {
    version: '0.8.5.2',
    date: '2026-06-24',
    highlights: [
      'Ao abrir um dia, a página começa no topo (primeiro voo) em vez de saltar para o fim.',
    ],
  },
  {
    version: '0.8.5.1',
    date: '2026-06-24',
    highlights: [
      'A tripulação aparece automaticamente nas escalas já importadas — sem teres de voltar a importar quando o reconhecimento melhora.',
    ],
  },
  {
    version: '0.8.5',
    date: '2026-06-24',
    highlights: [
      'Tripulação por voo: cada voo mostra a tripulação escalada no banner (ícone 👥). ⚠️ EM TESTES — confirma sempre na escala oficial do CrewLink.',
      'Correção: o banner do voo já é legível no modo escuro.',
    ],
  },
  {
    version: '0.8.4',
    date: '2026-06-23',
    highlights: [
      'Tutorial guiado: balões mostram como descarregar a escala na 1.ª utilização.',
      'Repete o tutorial em Definições → “Ver tutorial”.',
    ],
  },
  {
    version: '0.8.3.8',
    date: '2026-06-23',
    highlights: [
      'O diário de bordo lembra-se de que meses estão recolhidos ou expandidos.',
    ],
  },
  {
    version: '0.8.3.7',
    date: '2026-06-23',
    highlights: [
      'Diário de bordo: meses podem ser recolhidos/expandidos.',
      'Definições: nota de que a chave AeroDataBox é pessoal e gratuita.',
    ],
  },
  {
    version: '0.8.3.6',
    date: '2026-06-23',
    highlights: [
      'Diário de bordo agrupado por mês, com total de setores e bloco por mês.',
    ],
  },
  {
    version: '0.8.3.5',
    date: '2026-06-23',
    highlights: [
      'Botão para remover a chave AeroDataBox movido para junto do campo.',
    ],
  },
  {
    version: '0.8.3.4',
    date: '2026-06-23',
    highlights: [
      'Arranque mais rápido (a app carrega por partes) e melhorias de qualidade internas.',
    ],
  },
  {
    version: '0.8.3.3',
    date: '2026-06-23',
    highlights: [
      'Cálculos de voo mais corretos: recência, fusos horários do calendário e tempos de voo.',
    ],
  },
  {
    version: '0.8.3.2',
    date: '2026-06-23',
    highlights: [
      'Maior robustez: importação de cópias de segurança validada e apagar perfil mais seguro.',
    ],
  },
  {
    version: '0.8.3.1',
    date: '2026-06-23',
    highlights: [
      'Novo ícone com fundo transparente.',
    ],
  },
  {
    version: '0.8.3',
    date: '2026-06-23',
    highlights: [
      'Cópia de segurança: exporta tudo para um ficheiro e importa após reinstalar.',
    ],
  },
  {
    version: '0.8.2.3',
    date: '2026-06-23',
    highlights: [
      'Correção da instalação no ecrã principal (ícones maskable e manifest).',
    ],
  },
  {
    version: '0.8.2.2',
    date: '2026-06-23',
    highlights: [
      'Novo ícone da aplicação.',
    ],
  },
  {
    version: '0.8.2.1',
    date: '2026-06-23',
    highlights: [
      'Secção "Sobre" nas Definições com informação do criador.',
    ],
  },
  {
    version: '0.8.2',
    date: '2026-06-23',
    highlights: [
      'Notificações CrewLink: vê as alterações (antes → depois) antes de confirmar.',
      'Diário de bordo permanente e editável (mantém-se ao limpar a escala).',
      'Mapa de voos, Estatísticas e Documentos & recência.',
      'Alertas de check-in no .ics e no Google Calendar.',
      'Modo escuro.',
      'Aviso de novidades sempre que a app é atualizada.',
    ],
  },
];

// True when version a is strictly newer than b (numeric, dotted).
export function versionGreater(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

// Release notes newer than the given version (what the user hasn't seen yet).
export function notesSince(version: string | null): ReleaseNote[] {
  if (!version) return [];
  return RELEASE_NOTES.filter((n) => versionGreater(n.version, version));
}
