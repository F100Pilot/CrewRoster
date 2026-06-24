// Guided product tour ("balões") built on driver.js. Highlights the key actions — above
// all, how to download a roster from CrewLink — and runs once on first launch; it can be
// replayed any time from Settings.
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { setTourSeen } from './storage/settings';

const steps: DriveStep[] = [
  {
    popover: {
      title: 'Bem-vindo ao CrewRoster 👋',
      description: 'Em poucos passos: como trazer a tua escala da Portugália para a app. Usa “Próximo”.',
    },
  },
  {
    element: '[data-tour="download"]',
    popover: {
      title: '1 · Descarregar a escala',
      description: 'Toca neste botão (a nuvem) para abrir o descarregamento da escala do CrewLink.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="download"]',
    popover: {
      title: '2 · Iniciar sessão e período',
      description: 'Na janela que abre, inicia sessão no CrewLink com as TUAS credenciais e escolhe o período. A app trata do resto — descarrega o PDF e organiza-o.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="download"]',
    popover: {
      title: '3 · Notificações',
      description: 'Se houver uma alteração por confirmar, a app mostra-te o antes → depois de cada dia antes de aplicar.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="nav"]',
    popover: {
      title: 'A tua escala, organizada',
      description: 'Depois de descarregada, navega aqui: Lista, Calendário, Diário de bordo, Estatísticas, Mapa e mais.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '[data-tour="settings"]',
    popover: {
      title: 'Definições',
      description: 'Aqui defines o tema, a chave AeroDataBox (matrículas), a cópia de segurança — e podes repetir este tutorial em “Ver tutorial”.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    popover: {
      title: 'Tudo pronto! 🎉',
      description: 'Começa por tocar na nuvem para descarregar a tua escala. Bons voos!',
    },
  },
];

export function startTour(): void {
  const d = driver({
    showProgress: true,
    nextBtnText: 'Próximo',
    prevBtnText: 'Anterior',
    doneBtnText: 'Concluir',
    progressText: '{{current}} de {{total}}',
    // Skip steps whose target isn't on screen (e.g. a tab hidden for cabin crew).
    steps: steps.filter((s) => !s.element || document.querySelector(s.element as string)),
    onDestroyed: () => setTourSeen(),
  });
  d.drive();
}
