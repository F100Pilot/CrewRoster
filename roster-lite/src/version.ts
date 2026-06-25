// Single source for the app's display name and version, shown in the header, the welcome
// screen and the shared-day image.
//
// Versioning — 0.8.<centesimal>[.<milésima>]:
//   • new features → bump the CENTESIMAL (3rd part): 0.8.2 → 0.8.3
//   • small fixes  → bump the MILÉSIMA (4th part):   0.8.2 → 0.8.2.1
// Add a RELEASE_NOTES entry for every bump so the "Novidades" pop-up can announce it.
export const APP_NAME = 'CrewRoster';
export const APP_VERSION = '0.8.8';
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
