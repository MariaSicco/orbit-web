/* =========================================================
   ORBIT — catálogo de productos (bilingüe ES / EN)
   Editá este archivo para cambiar productos, precios y links
   de pago. Todo el sitio se construye a partir de acá.

   Los textos van como { es: '...', en: '...' }.
   checkout: pegá el link de pago de tu plataforma
   (Lemon Squeezy, Gumroad, Stripe Payment Links, Hotmart…).
   Mientras sea "", el botón avisa que el pago no está activo.

   price = USD (PayPal, se muestra en inglés).
   ars   = pesos (Mercado Pago, se muestra en español).
   ========================================================= */
window.ORBIT_CURRENCY = 'USD';

const COMMERCIAL = {es: 'Uso comercial', en: 'Commercial use'};
const INSTANT = {es: 'Descarga inmediata', en: 'Instant download'};

window.ORBIT_PRODUCTS = [
  {
    id: 'ob-012', ars: 5990, cover: 'poster', code: 'OB\u2014012', n: '12', name: 'Postres para vender',
    family: 'business', status: 'available', price: 4, accent: 'or', checkout: '', photo: 'studio',
    nicho: 'cocina', pieza: 'entrada',
    pantallasDir: 'ob-012',
    pantallas: [
      ['p1', {es: 'La calculadora', en: 'The calculator'}, {es: 'Elegís el postre y te dice cuánto te cuesta la porción y a cuánto venderla.', en: 'Pick the dessert and it tells you the cost per portion and what to charge.'}],
      ['p2', {es: 'Tus precios', en: 'Your prices'}, {es: 'Cargás lo que pagás la harina, el azúcar y lo demás. Todo se recalcula solo.', en: 'Enter what you pay for flour, sugar and the rest. Everything recalculates.'}],
      ['p3', {es: 'El recetario', en: 'The recipe book'}, {es: '40 postres que se venden, con cantidades en gramos y porciones.', en: '40 desserts that sell, with grams and portions.'}],
    ],
    tagline: {es: '40 postres que se venden y una calculadora que te dice a cuánto venderlos.', en: '40 desserts that sell and a calculator that tells you what to charge.'},
    specs: [
      [{es: 'Formato', en: 'Format'}, {es: 'Web + Excel + 2 PDF', en: 'Web + Excel + 2 PDFs'}],
      [{es: 'Recetas', en: 'Recipes'}, '40'],
      [{es: 'Primer precio', en: 'First price'}, {es: '5 minutos', en: '5 minutes'}],
      [{es: 'Licencia', en: 'License'}, COMMERCIAL],
      [{es: 'Entrega', en: 'Delivery'}, INSTANT],
    ],
    includes: [
      [{es: 'Calculadora de precios', en: 'Price calculator'}, {es: 'Costo por porción, por docena y por torta, con tu hora, el packaging y el gas incluidos', en: 'Cost per portion, dozen and cake, including your time, packaging and gas'}],
      [{es: 'Recetario de 40 postres', en: '40-dessert recipe book'}, {es: 'Chocotorta, lemon pie, alfajores, brownies, budines, postres en vaso y más', en: 'Chocotorta, lemon pie, alfajores, brownies, loaves, cup desserts and more'}],
      [{es: 'Guía para vender', en: 'Selling guide'}, {es: 'Fotos con el celular, packaging, pedidos por WhatsApp, señas y lo legal básico', en: 'Phone photos, packaging, WhatsApp orders, deposits and legal basics'}],
      [{es: 'Registro de pedidos', en: 'Order log'}, {es: 'En Excel: cliente, seña, saldo y fecha de entrega', en: 'In Excel: client, deposit, balance and delivery date'}],
    ],
    for: [
      {es: 'Quien cocina rico y quiere empezar a vender', en: 'Anyone who bakes well and wants to start selling'},
      {es: 'Quien ya vende y no sabe si cobra bien', en: 'Anyone already selling who is unsure about prices'},
      {es: 'Quien vende por Instagram o WhatsApp', en: 'Anyone selling on Instagram or WhatsApp'},
    ],
  },
  {
    id: 'ob-014', ars: 4990, cover: 'poster', code: 'OB\u2014014', n: '14', name: 'Salados para vender',
    family: 'business', status: 'available', price: 4, accent: 'blue', checkout: '', photo: 'studio',
    nicho: 'cocina', pieza: 'complemento',
    pantallasDir: 'ob-014',
    pantallas: [
      ['p1', {es: 'La calculadora', en: 'The calculator'}, {es: 'Elegís el salado y te dice cuánto te cuesta cada bocado y a cuánto venderlo.', en: 'Pick the item and it tells you the cost per bite and what to charge.'}],
      ['p2', {es: 'El cotizador de eventos', en: 'The event quoter'}, {es: 'Personas por bocados: total, precio por persona y presupuesto para WhatsApp.', en: 'Guests times bites: total, price per guest and a WhatsApp quote.'}],
      ['p3', {es: 'El recetario', en: 'The recipe book'}, {es: '40 salados: miga, empanadas, bocaditos, tartas y dips.', en: '40 savory items: sandwiches, empanadas, bites, tarts and dips.'}],
    ],
    tagline: {es: '40 salados que se venden y un cotizador que te dice cuánto cobrar cada evento.', en: '40 savory items that sell and a quoter that tells you what to charge per event.'},
    specs: [
      [{es: 'Formato', en: 'Format'}, {es: 'Web + Excel + 2 PDF', en: 'Web + Excel + 2 PDFs'}],
      [{es: 'Recetas', en: 'Recipes'}, '40'],
      [{es: 'Cotizar un evento', en: 'Quote an event'}, {es: '1 minuto', en: '1 minute'}],
      [{es: 'Licencia', en: 'License'}, COMMERCIAL],
      [{es: 'Entrega', en: 'Delivery'}, INSTANT],
    ],
    includes: [
      [{es: 'Calculadora y cotizador', en: 'Calculator and quoter'}, {es: 'Costo por bocado, docena y bandeja de 50; eventos por cantidad de personas', en: 'Cost per bite, dozen and tray of 50; events by number of guests'}],
      [{es: 'Recetario de 40 salados', en: '40-recipe book'}, {es: 'Miga, empanadas, bocaditos, panificados, tartas y dips, en gramos', en: 'Sandwiches, empanadas, bites, breads, tarts and dips, in grams'}],
      [{es: 'Guía para vender', en: 'Selling guide'}, {es: 'Cotizar eventos, cadena de frío, transporte, fotos y WhatsApp', en: 'Event quotes, cold chain, transport, photos and WhatsApp'}],
      [{es: 'Registro de pedidos', en: 'Order log'}, {es: 'En Excel: cliente, seña, saldo y fecha', en: 'In Excel: client, deposit, balance and date'}],
    ],
    for: [
      {es: 'Quien ya vende postres y quiere sumar eventos', en: 'Anyone selling desserts who wants to add events'},
      {es: 'Quien arma mesas para cumpleaños y reuniones', en: 'Anyone catering birthdays and gatherings'},
      {es: 'Quien cotiza a ojo y no sabe si gana', en: 'Anyone quoting by eye and unsure if they profit'},
    ],
  },
  {
    id: 'ob-015', ars: 8990, cover: 'libro', code: 'OB\u2014015', n: '15', name: 'Tardes sin pantalla',
    family: 'library', status: 'available', price: 6, accent: 'blue', checkout: '', photo: 'studio',
    nicho: 'chicos', pieza: 'ancla',
    pantallasDir: 'ob-015',
    pantallas: [
      ['p1', {es: 'El cuaderno', en: 'The book'}, {es: '120 actividades para imprimir, en 6 secciones que van de fácil a difícil.', en: '120 printable activities in 6 sections, from easy to hard.'}],
      ['p2', {es: 'Las actividades', en: 'The activities'}, {es: 'Laberintos, trazos, números, patrones, encontrar y colorear con consigna.', en: 'Mazes, tracing, numbers, patterns, spot-it and color by number.'}],
      ['p3', {es: 'El final', en: 'The finish'}, {es: 'Soluciones para el adulto y un diploma para cuando lo terminan.', en: 'Answer keys for the adult and a certificate when they finish.'}],
    ],
    tagline: {es: '120 actividades para imprimir que los chicos de 4 a 7 años hacen solos, sin pantallas.', en: '120 printable activities kids aged 4 to 7 do on their own, screen-free.'},
    specs: [
      [{es: 'Formato', en: 'Format'}, {es: 'PDF A4 para imprimir', en: 'Printable A4 PDF'}],
      [{es: 'Actividades', en: 'Activities'}, '120'],
      [{es: 'Edad', en: 'Age'}, {es: '4 a 7 años', en: '4 to 7'}],
      [{es: 'Licencia', en: 'License'}, {es: 'Casa y aula', en: 'Home and classroom'}],
      [{es: 'Entrega', en: 'Delivery'}, INSTANT],
    ],
    includes: [
      [{es: '120 actividades', en: '120 activities'}, {es: 'Laberintos, trazos, números y conteo, patrones, encontrá y uní, colorear con consigna', en: 'Mazes, tracing, counting, patterns, spot-it and matching, color by number'}],
      [{es: 'Soluciones', en: 'Answer keys'}, {es: 'Para que el adulto revise en un minuto', en: 'So the adult can check in a minute'}],
      [{es: 'Registro y diploma', en: 'Tracker and certificate'}, {es: 'Una estrella por actividad y un diploma al terminar', en: 'A star per activity and a certificate at the end'}],
      [{es: 'Secciones sueltas', en: 'Separate sections'}, {es: 'Cada sección en su PDF, para imprimir de a una', en: 'Each section as its own PDF, to print one at a time'}],
    ],
    for: [
      {es: 'Familias que quieren tardes sin celular', en: 'Families who want phone-free afternoons'},
      {es: 'Maestras de nivel inicial y primer grado', en: 'Preschool and first-grade teachers'},
      {es: 'Vacaciones, viajes y días de lluvia', en: 'Holidays, trips and rainy days'},
    ],
  },
  {
    id: 'ob-016', ars: 4990, cover: 'libro', code: 'OB\u2014016', n: '16', name: 'Primeras letras',
    family: 'library', status: 'available', price: 4, accent: 'or', checkout: '', photo: 'studio',
    nicho: 'chicos', pieza: 'complemento',
    pantallasDir: 'ob-016',
    pantallas: [
      ['p1', {es: 'Las páginas', en: 'The pages'}, {es: 'Vocales, consonantes, sílabas y palabras en imprenta mayúscula.', en: 'Vowels, consonants, syllables and words in uppercase print.'}],
      ['p2', {es: 'Con Tardes sin pantalla', en: 'With Tardes sin pantalla'}, {es: 'Mismo diseño y mismos personajes: se arman juntos.', en: 'Same design and characters: they work together.'}],
    ],
    tagline: {es: '55 actividades para empezar a leer y escribir en imprenta mayúscula, como en la escuela.', en: '55 activities to start reading and writing in uppercase print, like at school.'},
    specs: [
      [{es: 'Formato', en: 'Format'}, {es: 'PDF A4 para imprimir', en: 'Printable A4 PDF'}],
      [{es: 'Actividades', en: 'Activities'}, '55'],
      [{es: 'Edad', en: 'Age'}, {es: '4 a 7 años', en: '4 to 7'}],
      [{es: 'Licencia', en: 'License'}, {es: 'Casa y aula', en: 'Home and classroom'}],
      [{es: 'Entrega', en: 'Delivery'}, INSTANT],
    ],
    includes: [
      [{es: 'Vocales', en: 'Vowels'}, {es: 'Trazo, dibujos que empiezan con cada una y repaso', en: 'Tracing, pictures starting with each and review'}],
      [{es: 'Consonantes y sílabas', en: 'Consonants and syllables'}, {es: 'M, P, S, L, T, N y D, con sus sílabas', en: 'M, P, S, L, T, N and D, with syllables'}],
      [{es: 'Palabras y oraciones', en: 'Words and sentences'}, {es: 'Repasar, completar la letra que falta y leer en voz alta', en: 'Trace, fill the missing letter and read aloud'}],
    ],
    for: [
      {es: 'Chicos que están arrancando a leer', en: 'Kids starting to read'},
      {es: 'Familias que quieren acompañar en casa', en: 'Families supporting at home'},
      {es: 'Maestras de sala de 5 y primer grado', en: 'Kindergarten and first-grade teachers'},
    ],
  },
  {
    id: 'ob-017', ars: 12990, cover: 'grid', code: 'OB\u2014017', n: '17', name: 'Comandos eléctricos',
    family: 'business', status: 'available', price: 9, accent: 'blue', checkout: '', photo: 'studio',
    nicho: 'electricistas', pieza: 'ancla',
    pantallasDir: 'ob-017',
    pantallas: [
      ['p1', {es: 'La guía', en: 'The guide'}, {es: '79 páginas para imprimir y llevar a la obra.', en: '79 pages to print and take to the job.'}],
      ['p2', {es: 'Los diagramas', en: 'The diagrams'}, {es: '25 circuitos de potencia y comando, con secuencia, materiales y fallas.', en: '25 power and control circuits, with sequence, materials and faults.'}],
      ['p3', {es: 'La calculadora', en: 'The calculator'}, {es: 'Potencia y arranque: corriente, protecciones, contactores y lista de materiales.', en: 'Power and starter: current, protections, contactors and bill of materials.'}],
    ],
    tagline: {es: '25 diagramas de comando verificados y una calculadora que te arma la lista de materiales del tablero.', en: '25 verified control diagrams and a calculator that builds the panel bill of materials.'},
    specs: [
      [{es: 'Formato', en: 'Format'}, {es: 'PDF + calculadora web', en: 'PDF + web calculator'}],
      [{es: 'Diagramas', en: 'Diagrams'}, '25'],
      [{es: 'Ejercicios', en: 'Exercises'}, {es: '20 con soluciones', en: '20 with answers'}],
      [{es: 'Licencia', en: 'License'}, {es: 'Uso profesional', en: 'Professional use'}],
      [{es: 'Entrega', en: 'Delivery'}, INSTANT],
    ],
    includes: [
      [{es: 'Guía de 79 páginas', en: '79-page guide'}, {es: 'Símbolos, componentes, cómo leer un diagrama y tablas de selección', en: 'Symbols, components, reading diagrams and selection tables'}],
      [{es: '25 diagramas', en: '25 diagrams'}, {es: 'Arranque directo, inversión, estrella-triángulo, bombas, secuenciales, portones y más', en: 'Direct-on-line, reversing, star-delta, pumps, sequential, gates and more'}],
      [{es: '20 ejercicios', en: '20 exercises'}, {es: 'Encontrá la falla y completá el diagrama, con soluciones', en: 'Find the fault and complete the diagram, with answers'}],
      [{es: 'Calculadora de tablero', en: 'Panel calculator'}, {es: 'Corriente, térmico, guardamotor, contactor, cable y materiales', en: 'Current, overload, motor breaker, contactor, cable and materials'}],
    ],
    for: [
      {es: 'Electricistas que quieren tomar trabajos de tableros', en: 'Electricians who want panel jobs'},
      {es: 'Estudiantes de escuelas técnicas', en: 'Technical school students'},
      {es: 'Técnicos de mantenimiento', en: 'Maintenance technicians'},
    ],
  },
  {
    id: 'ob-006', ars: 14999, cover: 'trajectory', code: 'OB—006', n: '06', name: 'Tarifador de fletes',
    family: 'business', status: 'available', price: 10, accent: 'blue', checkout: '', photo: 'arch',
    nicho: 'fleteros', pieza: 'entrada',
    pantallasDir: 'ob-006',
    pantallas: [
      ['p1', {es: 'Cargás el viaje', en: 'Enter the trip'}, {es: 'Km, gasoil, peajes, chofer y tus gastos fijos.', en: 'Km, diesel, tolls, driver and your fixed costs.'}],
      ['p2', {es: 'Cuánto cobrar', en: 'What to charge'}, {es: 'Costo total, costo por km, tarifa sugerida y ganancia.', en: 'Total cost, cost per km, suggested rate and profit.'}],
      ['p3', {es: 'La planilla', en: 'The spreadsheet'}, {es: 'La misma cuenta en Excel o Google Sheets, con historial de presupuestos.', en: 'The same math in Excel or Google Sheets, with a quote history.'}],
    ],
    tagline: {es: 'Cargá el viaje y sabé en un minuto cuánto cobrar y cuánto ganás.', en: 'Enter the trip and know in a minute what to charge and what you earn.'},
    specs: [
      [{es: 'Formato', en: 'Format'}, {es: 'Web + Excel + PDF', en: 'Web + Excel + PDF'}],
      [{es: 'Funciona en', en: 'Works on'}, {es: 'Celular y compu', en: 'Phone and desktop'}],
      [{es: 'Primer presupuesto', en: 'First quote'}, {es: '5 minutos', en: '5 minutes'}],
      [{es: 'Licencia', en: 'License'}, COMMERCIAL],
      [{es: 'Entrega', en: 'Delivery'}, INSTANT],
    ],
    includes: [
      [{es: 'Tarifador web', en: 'Web rate calculator'}, {es: 'Se usa como una app del celular, sin instalar nada ni crear cuenta', en: 'Works like a phone app, no install, no sign-up'}],
      [{es: 'Semáforo de la oferta', en: 'Offer traffic light'}, {es: 'Cargás lo que te ofrecen y te dice si ganás, empatás o perdés', en: 'Enter what you are offered and it tells you if you win, break even or lose'}],
      [{es: 'Presupuesto para WhatsApp', en: 'WhatsApp quote'}, {es: 'Un botón copia el presupuesto listo para mandar', en: 'One button copies the quote ready to send'}],
      [{es: 'Planilla y guía', en: 'Spreadsheet and guide'}, {es: 'Excel o Google Sheets con historial, más guía PDF de 3 páginas', en: 'Excel or Google Sheets with history, plus a 3-page PDF guide'}],
    ],
    for: [
      {es: 'Fleteros con 1 a 5 camiones o utilitarios', en: 'Haulers with 1 to 5 trucks or vans'},
      {es: 'Quien hoy cotiza a ojo', en: 'Anyone quoting by gut feeling'},
      {es: 'Quien no sabe si la vuelta vacía le come la ganancia', en: 'Anyone unsure if the empty return eats the profit'},
    ],
  },
  {
    id: 'ob-007', ars: 74999, cover: 'grid', code: 'OB—007', n: '07', name: 'Sistema de costos y tarifas',
    family: 'business', status: 'available', price: 49, accent: 'blue', checkout: '', photo: 'arch',
    nicho: 'fleteros', pieza: 'ancla',
    pantallasDir: 'ob-007',
    pantallas: [
      ['p1', {es: 'Tablero', en: 'Dashboard'}, {es: 'Costo por km, ganancia del mes, margen y quién te hace ganar.', en: 'Cost per km, monthly profit, margin and who makes you money.'}],
      ['p2', {es: 'Costo por km', en: 'Cost per km'}, {es: 'Fijos y variables de cada camión en una sola cifra.', en: 'Fixed and variable costs of each truck in one number.'}],
      ['p3', {es: 'Tarifario', en: 'Rate sheet'}, {es: 'Tarifa sugerida por cliente y ruta contra lo que cobrás hoy.', en: 'Suggested rate per client and route against what you charge today.'}],
    ],
    tagline: {es: 'Sabé cuánto te cuesta cada km de cada camión y qué cliente te hace ganar.', en: 'Know what each km of each truck costs you and which client makes you money.'},
    specs: [
      [{es: 'Formato', en: 'Format'}, {es: 'Excel + guía PDF', en: 'Excel + PDF guide'}],
      [{es: 'Capacidad', en: 'Capacity'}, {es: '15 unidades · 500 viajes', en: '15 units · 500 trips'}],
      [{es: 'Primer resultado', en: 'First result'}, {es: '15 minutos', en: '15 minutes'}],
      [{es: 'Licencia', en: 'License'}, COMMERCIAL],
      [{es: 'Entrega', en: 'Delivery'}, INSTANT],
    ],
    includes: [
      [{es: 'Costo por km real', en: 'Real cost per km'}, {es: 'Fijos, gasoil, cubiertas, service y peajes, unidad por unidad', en: 'Fixed costs, diesel, tyres, service and tolls, truck by truck'}],
      [{es: 'Tarifario por cliente y ruta', en: 'Rates per client and route'}, {es: 'Ves al instante si cobrás bien, si el margen es bajo o si perdés', en: 'See instantly if you charge right, if the margin is thin or if you lose'}],
      [{es: 'Rentabilidad', en: 'Profitability'}, {es: 'Por mes, por camión y por cliente, con ranking', en: 'By month, truck and client, with a ranking'}],
      [{es: 'Tablero y guía', en: 'Dashboard and guide'}, {es: '8 indicadores, 4 alertas, 3 gráficos y guía PDF de 6 páginas', en: '8 KPIs, 4 alerts, 3 charts and a 6-page PDF guide'}],
    ],
    for: [
      {es: 'Pymes de transporte con 1 a 15 unidades', en: 'Trucking SMEs with 1 to 15 units'},
      {es: 'Quien cobra “lo que paga el mercado”', en: 'Anyone charging “what the market pays”'},
      {es: 'Quien quiere negociar tarifas con números', en: 'Anyone who wants to negotiate rates with numbers'},
    ],
  },
  {
    id: 'ob-008', ars: 28999, cover: 'archive', code: 'OB—008', n: '08', name: 'Control de viajes y cobranzas',
    family: 'business', status: 'available', price: 19, accent: 'or', checkout: '', photo: 'arch',
    nicho: 'fleteros', pieza: 'complemento',
    pantallasDir: 'ob-008',
    pantallas: [
      ['p1', {es: 'Deudores', en: 'Debtors'}, {es: 'Quién te debe y desde cuándo, en tramos de 30 días.', en: 'Who owes you and since when, in 30-day buckets.'}],
      ['p2', {es: 'Viajes', en: 'Trips'}, {es: 'Cada viaje con su remito, y los que faltan facturar en rojo.', en: 'Every trip with its delivery note, unbilled ones in red.'}],
      ['p3', {es: 'Resumen', en: 'Summary'}, {es: 'Facturado contra cobrado, y a quién llamar esta semana.', en: 'Billed vs collected, and who to call this week.'}],
    ],
    tagline: {es: 'Cada viaje registrado, cada peso cobrado. Sabé quién te debe y desde cuándo.', en: 'Every trip logged, every peso collected. Know who owes you and since when.'},
    specs: [
      [{es: 'Formato', en: 'Format'}, {es: 'Excel + guía PDF', en: 'Excel + PDF guide'}],
      [{es: 'Funciona en', en: 'Works on'}, {es: 'Excel y Google Sheets', en: 'Excel and Google Sheets'}],
      [{es: 'Primer resultado', en: 'First result'}, {es: '15 minutos', en: '15 minutes'}],
      [{es: 'Licencia', en: 'License'}, COMMERCIAL],
      [{es: 'Entrega', en: 'Delivery'}, INSTANT],
    ],
    includes: [
      [{es: 'Viajes sin facturar', en: 'Unbilled trips'}, {es: 'Aparecen en rojo, con los días que llevan, hasta que los facturás', en: 'They show in red, with days elapsed, until you bill them'}],
      [{es: 'Deudores por antigüedad', en: 'Debtors by age'}, {es: 'Saldo por cliente en tramos 0–30, 31–60, 61–90 y +90 días', en: 'Balance per client in 0–30, 31–60, 61–90 and 90+ day buckets'}],
      [{es: 'Cobros de la semana', en: 'This week’s collections'}, {es: 'Lo vencido más lo que vence en 7 días, con el teléfono de cada cliente', en: 'What is overdue plus what is due in 7 days, with each client’s phone'}],
      [{es: 'No es facturación', en: 'Not an invoicing system'}, {es: 'La factura se hace en ARCA; acá la registrás y seguís el cobro', en: 'You invoice in ARCA; here you log it and track payment'}],
    ],
    for: [
      {es: 'Fleteros que cobran a 15, 30 o 60 días', en: 'Haulers paid at 15, 30 or 60 days'},
      {es: 'Quien lleva los viajes en un cuaderno', en: 'Anyone logging trips in a notebook'},
      {es: 'Quien se entera tarde de que le deben', en: 'Anyone who finds out late they are owed money'},
    ],
  },
  {
    id: 'ob-009', ars: 14999, cover: 'libro', code: 'OB—009', n: '09', name: 'Agenda de vencimientos',
    family: 'systems', status: 'available', price: 10, accent: 'blue', checkout: '', photo: 'corridor',
    nicho: 'abogados', pieza: 'entrada',
    pantallasDir: 'ob-009',
    pantallas: [
      ['p1', {es: 'Vencimientos', en: 'Deadlines'}, {es: 'Cargás notificación y plazo: el vencimiento se calcula en días hábiles.', en: 'Enter notice date and term: the deadline is counted in business days.'}],
      ['p2', {es: 'Esta semana', en: 'This week'}, {es: 'Todo lo que vence en los próximos 7 días, ordenado y con semáforo.', en: 'Everything due in the next 7 days, sorted, with a traffic light.'}],
      ['p3', {es: 'Feriados y ferias', en: 'Holidays and court recesses'}, {es: 'Feriados nacionales oficiales, más tus días inhábiles y ferias.', en: 'Official national holidays, plus your local non-working days and recesses.'}],
    ],
    tagline: {es: 'Tus vencimientos en un solo lugar, con días hábiles ya contados.', en: 'All your deadlines in one place, with business days already counted.'},
    specs: [
      [{es: 'Formato', en: 'Format'}, {es: 'Excel + guía PDF', en: 'Excel + PDF guide'}],
      [{es: 'Funciona en', en: 'Works on'}, {es: 'Excel y Google Sheets', en: 'Excel and Google Sheets'}],
      [{es: 'Feriados', en: 'Holidays'}, {es: 'Nacionales 2026 y 2027', en: 'National 2026 and 2027'}],
      [{es: 'Licencia', en: 'License'}, COMMERCIAL],
      [{es: 'Entrega', en: 'Delivery'}, INSTANT],
    ],
    includes: [
      [{es: 'Días hábiles contados solos', en: 'Business days counted for you'}, {es: 'Saltea fines de semana, feriados nacionales, tus inhábiles locales y las ferias que cargues', en: 'Skips weekends, national holidays, your local non-working days and the recesses you add'}],
      [{es: 'Semáforo', en: 'Traffic light'}, {es: 'Vencido, hoy, 3 días o menos, en orden', en: 'Overdue, today, 3 days or less, in order'}],
      [{es: 'Expedientes y responsables', en: 'Files and owners'}, {es: 'Todo el estudio en una planilla que podés compartir', en: 'The whole practice in one shareable spreadsheet'}],
      [{es: 'Una ayuda, no un reemplazo', en: 'A help, not a substitute'}, {es: 'El plazo lo cargás vos; el cómputo se verifica según tu código procesal y acordadas', en: 'You enter the term; the count is checked against your procedural code and rules'}],
    ],
    for: [
      {es: 'Abogadas y abogados independientes', en: 'Independent lawyers'},
      {es: 'Estudios de 1 a 4 profesionales', en: 'Firms of 1 to 4 lawyers'},
      {es: 'Quien lleva los plazos en un cuaderno o en el celular', en: 'Anyone tracking deadlines in a notebook or on their phone'},
    ],
  },
  {
    id: 'ob-010', ars: 74999, cover: 'grid', code: 'OB—010', n: '10', name: 'Sistema de gestión del estudio',
    family: 'systems', status: 'available', price: 49, accent: 'blue', checkout: '', photo: 'corridor',
    nicho: 'abogados', pieza: 'ancla',
    pantallasDir: 'ob-010',
    pantallas: [
      ['p1', {es: 'Tablero del estudio', en: 'Practice dashboard'}, {es: 'Qué vence esta semana, qué tareas están atrasadas y qué falta cobrar.', en: 'What is due this week, which tasks are late and what is still unpaid.'}],
      ['p2', {es: 'Casos', en: 'Cases'}, {es: 'Cada caso con cliente, expediente, fechas, tareas y honorarios adentro.', en: 'Each case with client, file, dates, tasks and fees inside.'}],
      ['p3', {es: 'Honorarios', en: 'Fees'}, {es: 'Lo pactado, lo cobrado y el saldo, por caso y por cliente.', en: 'Agreed, collected and balance, per case and client.'}],
    ],
    tagline: {es: 'Casos, clientes, audiencias, tareas y honorarios en un solo tablero de Notion.', en: 'Cases, clients, hearings, tasks and fees on one Notion dashboard.'},
    specs: [
      [{es: 'Formato', en: 'Format'}, {es: 'Plantilla de Notion', en: 'Notion template'}],
      [{es: 'Requiere', en: 'Requires'}, {es: 'Notion (alcanza el plan gratis)', en: 'Notion (free plan works)'}],
      [{es: 'Primer caso cargado', en: 'First case loaded'}, {es: '15 minutos', en: '15 minutes'}],
      [{es: 'Licencia', en: 'License'}, COMMERCIAL],
      [{es: 'Entrega', en: 'Delivery'}, {es: 'Link para duplicar + guía', en: 'Duplicate link + guide'}],
    ],
    includes: [
      [{es: '6 bases conectadas', en: '6 linked databases'}, {es: 'Casos, Clientes, Audiencias y vencimientos, Tareas, Honorarios y Cobros', en: 'Cases, Clients, Hearings and deadlines, Tasks, Fees and Payments'}],
      [{es: 'Tablero del día', en: 'Daily dashboard'}, {es: 'Próximos 7 días, tareas vencidas, casos por estado y honorarios pendientes', en: 'Next 7 days, overdue tasks, cases by status and pending fees'}],
      [{es: 'Vistas listas', en: 'Ready-made views'}, {es: 'Kanban de casos, calendario de audiencias y “Mis tareas”', en: 'Case kanban, hearings calendar and “My tasks”'}],
      [{es: 'Empezá acá', en: 'Start here'}, {es: 'Una página que te lleva al primer caso cargado, más guía PDF de 5 páginas', en: 'A page that gets you to your first case, plus a 5-page PDF guide'}],
    ],
    for: [
      {es: 'Abogados independientes', en: 'Independent lawyers'},
      {es: 'Estudios chicos de 1 a 4 profesionales', en: 'Small firms of 1 to 4 lawyers'},
      {es: 'Quien tiene los casos repartidos entre WhatsApp, Excel y papeles', en: 'Anyone with cases spread across WhatsApp, Excel and paper'},
    ],
  },
  {
    id: 'ob-011', ars: 28999, cover: 'poster', code: 'OB—011', n: '11', name: 'Control de honorarios',
    family: 'systems', status: 'available', price: 19, accent: 'or', checkout: '', photo: 'corridor',
    nicho: 'abogados', pieza: 'complemento',
    pantallasDir: 'ob-011',
    pantallas: [
      ['p1', {es: 'Saldos', en: 'Balances'}, {es: 'Cuánto te debe cada cliente y desde cuándo.', en: 'How much each client owes and since when.'}],
      ['p2', {es: 'Plan de cobro', en: 'Payment plan'}, {es: 'Cargás el acuerdo una vez y las cuotas se arman solas.', en: 'Enter the agreement once and the instalments build themselves.'}],
      ['p3', {es: 'Proyección', en: 'Forecast'}, {es: 'Lo que vas a cobrar en los próximos 6 meses.', en: 'What you will collect over the next 6 months.'}],
    ],
    tagline: {es: 'Sabé cuánto te deben, quién y cuándo vas a cobrar.', en: 'Know how much you are owed, by whom and when you will get paid.'},
    specs: [
      [{es: 'Formato', en: 'Format'}, {es: 'Excel + guía PDF', en: 'Excel + PDF guide'}],
      [{es: 'Funciona en', en: 'Works on'}, {es: 'Excel y Google Sheets', en: 'Excel and Google Sheets'}],
      [{es: 'Modalidades', en: 'Fee types'}, {es: 'Fijo, etapa o %', en: 'Fixed, stage or %'}],
      [{es: 'Licencia', en: 'License'}, COMMERCIAL],
      [{es: 'Entrega', en: 'Delivery'}, INSTANT],
    ],
    includes: [
      [{es: 'Plan de cobro automático', en: 'Automatic payment plan'}, {es: 'Cada acuerdo genera sus cuotas y cada pago se aplica a la más vieja', en: 'Each agreement builds its instalments and each payment goes to the oldest'}],
      [{es: 'Saldos por antigüedad', en: 'Balances by age'}, {es: 'Por cliente y por acuerdo, en tramos de 30 días', en: 'By client and agreement, in 30-day buckets'}],
      [{es: 'Proyección a 6 meses', en: '6-month forecast'}, {es: 'Cuánto entra cada mes, con gráfico', en: 'How much comes in each month, with a chart'}],
      [{es: 'No calcula aranceles', en: 'No fee scales'}, {es: 'Los montos los cargás vos; no es facturación ni asesoramiento', en: 'You enter the amounts; it is not invoicing or advice'}],
    ],
    for: [
      {es: 'Abogados que pactan honorarios en cuotas', en: 'Lawyers who agree fees in instalments'},
      {es: 'Estudios chicos sin administración', en: 'Small firms without an admin'},
      {es: 'Quien sigue los cobros en la cabeza', en: 'Anyone tracking payments in their head'},
    ],
  },
  {
    /* Herramienta online, no es un archivo que se descarga: por eso la entrega
       es un acceso desde Mi cuenta y la licencia es por persona, no comercial. */
    id: 'ob-005', cover: 'libro', code: 'OB\u2014005', n: '05', name: 'Orbit IVA',
    family: 'business', status: 'soon', price: 79, accent: 'blue', checkout: '', photo: 'ob-005',
    acceso: '/herramientas/iva',
    /* Lo que se muestra de este producto son sus propias pantallas, no una foto
       de ambiente: es una herramienta, se vende mostrando lo que hace. Cada
       archivo tiene su version -es y -en. */
    /* Las pantallas enteras de la herramienta, sin recortar: el texto que las
       explica va en la página, no quemado adentro de la imagen. */
    pantallas: [
      ['p1', {es: 'Entrada', en: 'Home'},
             {es: 'Las dos herramientas y el estado del mes.', en: 'The two tools and the state of the month.'}],
      ['p2', {es: 'Calculadora de IVA', en: 'VAT calculator'},
             {es: 'El IVA del mes, el desglose por concepto y el detalle factura por factura.', en: 'The month’s VAT, the breakdown by item and the invoice-by-invoice detail.'}],
      ['p3', {es: 'Conciliador · Archivos', en: 'Reconciler · Files'},
             {es: 'Subís el Excel de tu sistema y el de ARCA.', en: 'Upload the Excel from your system and the one from ARCA.'}],
      ['p4', {es: 'Conciliador · Columnas', en: 'Reconciler · Columns'},
             {es: 'Reconoce solo las columnas de cada archivo y las podés corregir.', en: 'It detects each file’s columns on its own, and you can correct them.'}],
      ['p5', {es: 'Conciliador · Reglas', en: 'Reconciler · Rules'},
             {es: 'Tolerancias, qué tiene que coincidir y la instrucción escrita a mano.', en: 'Tolerances, what has to match, and the instruction written in your own words.'}],
      ['p6', {es: 'Conciliador · Resultados', en: 'Reconciler · Results'},
             {es: 'Solo lo que necesita atención, con el motivo de cada caso.', en: 'Only what needs attention, with the reason for every case.'}],
    ],
    pantallasDir: 'ob-005',
    tagline: {es: 'Dos herramientas para cerrar el IVA del mes: arma el Libro de Compras desde las facturas y cruza tu sistema con ARCA.', en: 'Two tools to close the month\u2019s VAT: it builds the purchase ledger from your invoices and cross-checks your system against ARCA.'},
    specs: [
      [{es: 'Lecturas', en: 'Reads'}, '1.500'],
      [{es: 'Formato', en: 'Format'}, {es: 'Online, sin instalar', en: 'Online, no install'}],
      [{es: 'Licencia', en: 'License'}, {es: 'Por persona', en: 'Per person'}],
      [{es: 'Actualizaciones', en: 'Updates'}, {es: '12 meses', en: '12 months'}],
      [{es: 'Alcance', en: 'Scope'}, {es: 'Estimaci\u00f3n para revisar', en: 'An estimate to review'}],
    ],
    includes: [
      [{es: 'Calculadora de IVA', en: 'VAT calculator'}, {es: 'Sub\u00eds fotos o PDF de las facturas de compra y arma el Libro de IVA del mes, con el desglose por al\u00edcuota', en: 'Upload photos or PDFs of your purchase invoices and it builds the month\u2019s VAT ledger, broken down by rate'}],
      [{es: 'Conciliador ARCA', en: 'ARCA reconciler'}, {es: 'Cruza el Excel de tu sistema contable con Mis Comprobantes y te muestra solo lo que necesita atenci\u00f3n, con el motivo de cada diferencia', en: 'Cross-checks your accounting system\u2019s Excel against Mis Comprobantes and shows only what needs attention, with the reason for every difference'}],
      [{es: 'Cada factura, controlada', en: 'Every invoice, checked'}, {es: 'La lectura la hace IA y despu\u00e9s se controla con cuentas: la suma tiene que dar el total y la CUIT tiene que ser v\u00e1lida. Lo dudoso queda marcado para que lo revises', en: 'AI does the reading and arithmetic checks it: the parts must add up to the total and the tax ID must be valid. Anything doubtful is flagged for you to review'}],
      [{es: 'Reglas en tus palabras', en: 'Rules in your own words'}, {es: 'Escrib\u00eds \u201cignor\u00e1 diferencias menores a $2\u201d y queda guardado para el mes siguiente', en: 'Write \u201cignore differences under $2\u201d and it\u2019s saved for next month'}],
      [{es: '1.500 lecturas incluidas', en: '1,500 reads included'}, {es: 'Cuando se terminan, recarg\u00e1s 1.000 m\u00e1s por USD 19 desde adentro de la herramienta', en: 'When they run out, top up 1,000 more for USD 19 from inside the tool'}],
      [{es: 'Uso sin vencimiento', en: 'No expiry'}, {es: 'La herramienta sigue siendo tuya; los 12 meses son de actualizaciones', en: 'The tool stays yours; the 12 months are for updates'}],
    ],
    for: [
      {es: 'Contadores y estudios que liquidan IVA de varios clientes', en: 'Accountants and firms filing VAT for several clients'},
      {es: 'Negocios que cargan sus propias facturas', en: 'Businesses that load their own invoices'},
      {es: 'Quien concilia a mano el sistema contra ARCA', en: 'Anyone reconciling their system against ARCA by hand'},
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
