/* =========================================================
   ORBIT — catálogo de productos
   Editá este archivo para cambiar productos, precios y links
   de pago. Todo el sitio se construye a partir de acá.

   checkout: pegá el link de pago de tu plataforma
   (Lemon Squeezy, Gumroad, Stripe Payment Links, Hotmart…).
   Mientras sea "", el botón avisa que el pago no está activo.

   ⚠ Precios, cantidades y contenidos son DE EJEMPLO.
   ========================================================= */
window.ORBIT_CURRENCY = 'USD';

window.ORBIT_PRODUCTS = [
  {
    id: 'ob-001',
    code: 'OB—001',
    n: '01',
    name: 'Content System',
    family: 'creator',
    status: 'available',
    price: 39,
    accent: 'blue',
    checkout: '',
    photo: 'hands',
    tagline: 'Un sistema completo para planificar, producir y publicar contenido sin empezar de cero.',
    specs: [['Assets', '120'], ['Formato', 'Figma · Canva · Notion'], ['Licencia', 'Uso comercial'], ['Versión', 'V.01'], ['Entrega', 'Descarga inmediata']],
    includes: [
      ['Plantillas de posts', '48 piezas editables para feed y stories'],
      ['Calendario editorial', 'Tablero en Notion con estados y pilares'],
      ['Sistema de portadas', '24 portadas para reels y carruseles'],
      ['Guía de uso', 'Cómo adaptar el sistema a tu marca en una tarde'],
    ],
    for: ['Creadores que publican todas las semanas', 'Estudios que gestionan varias cuentas', 'Marcas personales que quieren consistencia'],
  },
  {
    id: 'ob-002',
    code: 'OB—002',
    n: '02',
    name: 'Creator Library',
    family: 'library',
    status: 'available',
    price: 49,
    accent: 'or',
    checkout: '',
    photo: 'studio',
    tagline: 'Una biblioteca curada de recursos gráficos listos para usar en proyectos reales.',
    specs: [['Assets', '340'], ['Formato', 'PNG · SVG · Figma'], ['Licencia', 'Uso comercial'], ['Versión', 'V.01'], ['Entrega', 'Descarga inmediata']],
    includes: [
      ['Texturas y grano', 'Fondos en alta resolución para piezas editoriales'],
      ['Formas y arcos', 'Elementos geométricos vectoriales'],
      ['Mockups', 'Pantallas, impresos y objetos para presentar trabajo'],
      ['Tipografía en uso', 'Composiciones editables de titulares'],
    ],
    for: ['Diseñadores freelance', 'Equipos de contenido', 'Quien presenta proyectos a clientes'],
  },
  {
    id: 'ob-003',
    code: 'OB—003',
    n: '03',
    name: 'Business OS',
    family: 'business',
    status: 'available',
    price: 59,
    accent: 'ac',
    checkout: '',
    photo: 'arch',
    tagline: 'El sistema operativo para pequeños negocios: clientes, proyectos, finanzas y procesos en un solo lugar.',
    specs: [['Módulos', '8'], ['Formato', 'Notion'], ['Licencia', 'Uso comercial'], ['Versión', 'V.01'], ['Entrega', 'Acceso inmediato']],
    includes: [
      ['CRM de clientes', 'Pipeline desde el primer contacto hasta el cobro'],
      ['Gestor de proyectos', 'Tareas, entregas y estados por cliente'],
      ['Finanzas simples', 'Ingresos, gastos y proyección mensual'],
      ['Procesos', 'Checklists para onboarding, entrega y cierre'],
    ],
    for: ['Estudios y agencias pequeñas', 'Freelancers con varios clientes', 'Negocios que venden servicios'],
  },
  {
    id: 'ob-004',
    code: 'OB—004',
    n: '04',
    name: 'AI Workflow System',
    family: 'ai',
    status: 'soon',
    price: 69,
    accent: 'b',
    checkout: '',
    photo: 'corridor',
    tagline: 'Workflows de IA probados para investigar, escribir, diseñar y automatizar con criterio.',
    specs: [['Workflows', '36'], ['Formato', 'Notion · guías'], ['Licencia', 'Uso comercial'], ['Versión', 'V.01'], ['Lanzamiento', 'Próximamente']],
    includes: [
      ['Investigación', 'De una pregunta a un brief ordenado'],
      ['Escritura', 'Borradores con tu voz, no con la de la IA'],
      ['Diseño', 'Exploración visual y variaciones rápidas'],
      ['Automatización', 'Tareas repetitivas que dejan de ser tuyas'],
    ],
    for: ['Creadores que quieren producir más sin perder calidad', 'Equipos chicos', 'Quien empieza con IA y quiere un método'],
  },
];

window.ORBIT_FAMILIES = {
  creator: ['Orbit Creator', 'Recursos para creadores'],
  business: ['Orbit Business', 'Sistemas para pequeños negocios'],
  ai: ['Orbit AI', 'Workflows y herramientas de IA'],
  library: ['Orbit Library', 'Assets comerciales'],
  systems: ['Orbit Systems', 'Productos operativos'],
};
