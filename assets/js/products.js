/* =========================================================
   ORBIT — catálogo de productos (bilingüe ES / EN)
   Editá este archivo para cambiar productos, precios y links
   de pago. Todo el sitio se construye a partir de acá.

   Los textos van como { es: '...', en: '...' }.
   checkout: pegá el link de pago de tu plataforma
   (Lemon Squeezy, Gumroad, Stripe Payment Links, Hotmart…).
   Mientras sea "", el botón avisa que el pago no está activo.

   ⚠ Precios, cantidades y contenidos son DE EJEMPLO.
   ========================================================= */
window.ORBIT_CURRENCY = 'USD';

const COMMERCIAL = {es: 'Uso comercial', en: 'Commercial use'};
const INSTANT = {es: 'Descarga inmediata', en: 'Instant download'};

window.ORBIT_PRODUCTS = [
  {
    id: 'ob-001', cover: 'archive', code: 'OB—001', n: '01', name: 'Content System',
    family: 'creator', status: 'available', price: 39, accent: 'blue', checkout: '', photo: 'hands',
    tagline: {es: 'Un sistema completo para planificar, producir y publicar contenido sin empezar de cero.', en: 'A complete system to plan, produce and publish content without starting from scratch.'},
    specs: [
      [{es: 'Assets', en: 'Assets'}, '120'],
      [{es: 'Formato', en: 'Format'}, 'Figma · Canva · Notion'],
      [{es: 'Licencia', en: 'License'}, COMMERCIAL],
      [{es: 'Versión', en: 'Version'}, 'V.01'],
      [{es: 'Entrega', en: 'Delivery'}, INSTANT],
    ],
    includes: [
      [{es: 'Plantillas de posts', en: 'Post templates'}, {es: '48 piezas editables para feed y stories', en: '48 editable pieces for feed and stories'}],
      [{es: 'Calendario editorial', en: 'Editorial calendar'}, {es: 'Tablero en Notion con estados y pilares', en: 'Notion board with statuses and pillars'}],
      [{es: 'Sistema de portadas', en: 'Cover system'}, {es: '24 portadas para reels y carruseles', en: '24 covers for reels and carousels'}],
      [{es: 'Guía de uso', en: 'Usage guide'}, {es: 'Cómo adaptar el sistema a tu marca en una tarde', en: 'How to adapt the system to your brand in one afternoon'}],
    ],
    for: [
      {es: 'Quienes publican todas las semanas', en: 'Anyone who publishes every week'},
      {es: 'Estudios que gestionan varias cuentas', en: 'Studios managing several accounts'},
      {es: 'Marcas que quieren consistencia', en: 'Brands that want consistency'},
    ],
  },
  {
    id: 'ob-002', cover: 'poster', code: 'OB—002', n: '02', name: 'Creator Library',
    family: 'library', status: 'available', price: 49, accent: 'or', checkout: '', photo: 'studio',
    tagline: {es: 'Una biblioteca curada de recursos gráficos listos para usar en proyectos reales.', en: 'A curated library of graphic resources ready to use in real projects.'},
    specs: [
      [{es: 'Assets', en: 'Assets'}, '340'],
      [{es: 'Formato', en: 'Format'}, 'PNG · SVG · Figma'],
      [{es: 'Licencia', en: 'License'}, COMMERCIAL],
      [{es: 'Versión', en: 'Version'}, 'V.01'],
      [{es: 'Entrega', en: 'Delivery'}, INSTANT],
    ],
    includes: [
      [{es: 'Texturas y grano', en: 'Textures & grain'}, {es: 'Fondos en alta resolución para piezas editoriales', en: 'High-resolution backgrounds for editorial pieces'}],
      [{es: 'Formas y arcos', en: 'Shapes & arcs'}, {es: 'Elementos geométricos vectoriales', en: 'Vector geometric elements'}],
      [{es: 'Mockups', en: 'Mockups'}, {es: 'Pantallas, impresos y objetos para presentar trabajo', en: 'Screens, prints and objects to present your work'}],
      [{es: 'Tipografía en uso', en: 'Type in use'}, {es: 'Composiciones editables de titulares', en: 'Editable headline compositions'}],
    ],
    for: [
      {es: 'Diseñadores freelance', en: 'Freelance designers'},
      {es: 'Equipos de contenido y marketing', en: 'Content and marketing teams'},
      {es: 'Quien presenta proyectos a clientes', en: 'Anyone pitching work to clients'},
    ],
  },
  {
    id: 'ob-003', cover: 'grid', code: 'OB—003', n: '03', name: 'Business OS',
    family: 'business', status: 'available', price: 59, accent: 'ac', checkout: '', photo: 'arch',
    tagline: {es: 'El sistema operativo para pequeños negocios: clientes, proyectos, finanzas y procesos en un solo lugar.', en: 'The operating system for small businesses: clients, projects, finances and processes in one place.'},
    specs: [
      [{es: 'Módulos', en: 'Modules'}, '8'],
      [{es: 'Formato', en: 'Format'}, 'Notion'],
      [{es: 'Licencia', en: 'License'}, COMMERCIAL],
      [{es: 'Versión', en: 'Version'}, 'V.01'],
      [{es: 'Entrega', en: 'Delivery'}, {es: 'Acceso inmediato', en: 'Instant access'}],
    ],
    includes: [
      [{es: 'CRM de clientes', en: 'Client CRM'}, {es: 'Pipeline desde el primer contacto hasta el cobro', en: 'Pipeline from first contact to payment'}],
      [{es: 'Gestor de proyectos', en: 'Project manager'}, {es: 'Tareas, entregas y estados por cliente', en: 'Tasks, deliveries and status per client'}],
      [{es: 'Finanzas simples', en: 'Simple finances'}, {es: 'Ingresos, gastos y proyección mensual', en: 'Income, expenses and monthly forecast'}],
      [{es: 'Procesos', en: 'Processes'}, {es: 'Checklists para onboarding, entrega y cierre', en: 'Checklists for onboarding, delivery and wrap-up'}],
    ],
    for: [
      {es: 'Estudios y agencias pequeñas', en: 'Small studios and agencies'},
      {es: 'Freelancers con varios clientes', en: 'Freelancers with several clients'},
      {es: 'Negocios que venden servicios', en: 'Service businesses'},
    ],
  },
  {
    id: 'ob-004', cover: 'trajectory', code: 'OB—004', n: '04', name: 'AI Workflow System',
    family: 'ai', status: 'soon', price: 69, accent: 'b', checkout: '', photo: 'corridor',
    tagline: {es: 'Workflows de IA probados para investigar, escribir, diseñar y automatizar con criterio.', en: 'Proven AI workflows to research, write, design and automate with judgment.'},
    specs: [
      [{es: 'Workflows', en: 'Workflows'}, '36'],
      [{es: 'Formato', en: 'Format'}, {es: 'Notion · guías', en: 'Notion · guides'}],
      [{es: 'Licencia', en: 'License'}, COMMERCIAL],
      [{es: 'Versión', en: 'Version'}, 'V.01'],
      [{es: 'Lanzamiento', en: 'Launch'}, {es: 'Próximamente', en: 'Coming soon'}],
    ],
    includes: [
      [{es: 'Investigación', en: 'Research'}, {es: 'De una pregunta a un brief ordenado', en: 'From a question to a clear brief'}],
      [{es: 'Escritura', en: 'Writing'}, {es: 'Borradores con tu voz, no con la de la IA', en: 'Drafts in your voice, not the AI’s'}],
      [{es: 'Diseño', en: 'Design'}, {es: 'Exploración visual y variaciones rápidas', en: 'Visual exploration and fast variations'}],
      [{es: 'Automatización', en: 'Automation'}, {es: 'Tareas repetitivas que dejan de ser tuyas', en: 'Repetitive tasks that stop being yours'}],
    ],
    for: [
      {es: 'Quien quiere producir más sin perder calidad', en: 'Anyone who wants to produce more without losing quality'},
      {es: 'Equipos chicos', en: 'Small teams'},
      {es: 'Quien empieza con IA y quiere un método', en: 'People starting with AI who want a method'},
    ],
  },
];

window.ORBIT_FAMILIES = {
  creator:  ['Orbit Creator',  {es: 'Recursos para crear y publicar', en: 'Resources to create and publish'}],
  business: ['Orbit Business', {es: 'Sistemas para pequeños negocios', en: 'Systems for small businesses'}],
  ai:       ['Orbit AI',       {es: 'Workflows y herramientas de IA', en: 'AI workflows and tools'}],
  library:  ['Orbit Library',  {es: 'Assets comerciales', en: 'Commercial assets'}],
  systems:  ['Orbit Systems',  {es: 'Productos operativos', en: 'Operational products'}],
};

/* =========================================================
   LA ESCALA — qué TIPO de cosa es cada familia.
   La usan la home (sección 03) y productos.html para agrupar el
   catálogo, siempre en este orden: plantillas, herramientas, sistemas.
   Si aparece una familia nueva sin ubicar, cae en `herramientas`.
   ========================================================= */
window.ORBIT_ESCALA = [
  {
    id: 'plantillas', fams: ['library'],
    n: {es: 'Plantillas', en: 'Templates'},
    d: {es: 'Piezas listas. Las abrís, les ponés lo tuyo, las usás hoy.',
        en: 'Ready pieces. Open them, make them yours, use them today.'},
  },
  {
    id: 'herramientas', fams: ['creator', 'ai'], resto: true,
    n: {es: 'Herramientas', en: 'Tools'},
    d: {es: 'Flujos de trabajo completos. No una pieza: la forma de hacerlas todas.',
        en: 'Complete workflows. Not one piece: the way to make them all.'},
  },
  {
    id: 'sistemas', fams: ['business', 'systems'],
    n: {es: 'Sistemas', en: 'Systems'},
    d: {es: 'Tu trabajo entero en un solo lugar. Clientes, proyectos, plata, procesos.',
        en: 'Your whole practice in one place. Clients, projects, money, processes.'},
  },
];
