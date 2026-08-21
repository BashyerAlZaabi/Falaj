/* =============================================================================
   سفراء الزراعة الشباب — Young Agriculture Ambassadors
   المحتوى ثنائي اللغة  ·  Bilingual content
   -----------------------------------------------------------------------------
   ملاحظة: هذا محتوى *مقترح* كُتب كنقطة انطلاق — عدّل النصوص والأرقام هنا فقط،
   ولا حاجة لتعديل المحرّك أو الرسوم. الأرقام مصاغة كـ«أهداف» لا كإنجازات.

   NOTE: this is *proposed* copy written as a starting point — edit the strings
   and figures here only; the engine and the artwork need no changes. Figures are
   phrased as targets, never as achieved results.
   ========================================================================== */

window.WORLD = (function () {
  'use strict';

  /* ---- هوية بصرية · brand kit ------------------------------------------- */
  const BRAND = {
    name:  { ar: 'سفراء الزراعة الشباب', en: 'Young Agriculture Ambassadors' },
    short: { ar: 'سفراء الزراعة',        en: 'Young Ambassadors' },
    parent:{ ar: 'بالشراكة مع فلج للزراعة الذكية', en: 'In partnership with FALAJ Smart Farming' },
    palette: {
      sand:  '#F2E9D8',  ink:  '#17203C',  inkSoft: '#5E678A',
      indigo:'#5171FF',  gold: '#E9B44C',  clay:   '#C96F4A',
      leaf:  '#2FA36B',  sprout:'#8FC46B', water:  '#35A0C4',
      night: '#101731',
    },
  };

  /* ---- المشاهد التي تطير عبرها الكاميرا · the scenes the camera flies through */
  const SCENES = [
    {
      id: 'seed', accent: '#E9B44C', sky: ['#8FB6E8', '#F3BE86'], theme: 'light',
      label:   { ar: 'البذرة',  en: 'The Seed' },
      eyebrow: { ar: 'مبادرة شبابية للأمن الغذائي', en: 'A youth initiative for food security' },
      title:   { ar: 'من بذرةٍ واحدة يبدأ وطنٌ أخضر',
                 en: 'A greener nation starts with a single seed' },
      body:    { ar: 'برنامج يأخذ الشباب من الفصل إلى الحقل: ستة أسابيع من التدريب على الزراعة الذكية، ومشروع ميداني حقيقي، وشبكة تبقى معهم بعد التخرّج.',
                 en: 'A programme that takes young people from the classroom to the field: six weeks of smart-farming training, one real field project, and a network that stays with them after graduation.' },
      tags:    { ar: ['١٥–٢٤ سنة', '٦ أسابيع', '٣ مسارات'],
                 en: ['Ages 15–24', '6 weeks', '3 tracks'] },
    },
    {
      id: 'nursery', accent: '#8FC46B', sky: ['#CFEBD4', '#F0F7E4'], theme: 'light',
      label:   { ar: 'المشتل', en: 'The Nursery' },
      eyebrow: { ar: 'المرحلة الأولى — المشتل', en: 'Phase one — the nursery' },
      title:   { ar: 'نبدأ من حيث تبدأ النبتة', en: 'We start where the plant starts' },
      body:    { ar: 'في المشتل يتعلّم السفراء الأساسيات بأيديهم: اختيار البذور، وتركيب التربة، والإنبات، وقراءة صحة النبتة قبل أن تنطق بها الأجهزة.',
                 en: 'In the nursery, ambassadors learn the fundamentals by hand: seed selection, soil mixes, germination, and reading a plant’s health before any sensor says a word.' },
      tags:    { ar: ['ورش عملية', 'مرشد لكل ٦ متدربين'],
                 en: ['Hands-on labs', '1 mentor per 6 trainees'] },
    },
    {
      id: 'falaj', accent: '#35A0C4', sky: ['#7FB4E4', '#D9EEF6'], theme: 'light',
      label:   { ar: 'الفلج الذكي', en: 'The Smart Falaj' },
      eyebrow: { ar: 'المرحلة الثانية — الماء', en: 'Phase two — the water' },
      title:   { ar: 'الماء أثمن من أن يُهدَر', en: 'Water is far too precious to waste' },
      body:    { ar: 'من الفلج التقليدي إلى الحسّاس الذكي: يبرمج السفراء الريّ حسب رطوبة التربة والطقس، ويقيسون كل لترٍ يوفّرونه على لوحة بياناتهم.',
                 en: 'From the traditional falaj to the smart sensor: ambassadors program irrigation against soil moisture and weather, then measure every litre they save on their own dashboard.' },
      tags:    { ar: ['إنترنت الأشياء', 'تحليل بيانات', 'ترشيد المياه'],
                 en: ['IoT sensors', 'Data analysis', 'Water efficiency'] },
    },
    {
      id: 'field', accent: '#2FA36B', sky: ['#7FB4E4', '#D9EEF6'], theme: 'light',
      label:   { ar: 'الحقل', en: 'The Field' },
      eyebrow: { ar: 'المرحلة الثالثة — المشروع الميداني', en: 'Phase three — the field project' },
      title:   { ar: 'قطعةُ أرض… ومسؤوليةٌ كاملة', en: 'A plot of land, and full responsibility' },
      body:    { ar: 'كل فريق يستلم قطعةً زراعية حقيقية لموسمٍ كامل: يخطّطها، ويزرعها، ويحصدها، ويوثّق نتيجتها — نجاحاً كانت أو درساً.',
                 en: 'Every team takes a real plot for a full season: they plan it, plant it, harvest it, and document the result — whether it turns out a success or a lesson.' },
      tags:    { ar: ['موسم كامل', 'فرق من ٤', 'تقرير حصاد'],
                 en: ['A full season', 'Teams of 4', 'Harvest report'] },
    },
    {
      id: 'souq', accent: '#D98E3B', sky: ['#4C5AA0', '#F5C98E'], theme: 'light',
      label:   { ar: 'السوق', en: 'The Market' },
      eyebrow: { ar: 'المرحلة الرابعة — من الحصاد إلى الرزق', en: 'Phase four — harvest to livelihood' },
      title:   { ar: 'المحصول وحده لا يكفي', en: 'A crop on its own is not enough' },
      body:    { ar: 'يتعلّم السفراء التسعير، والتغليف، وسلسلة التبريد، وكيف يصل صندوقهم إلى السوق المحلي بأفضل جودة وأقلّ هدر.',
                 en: 'Ambassadors learn pricing, packaging and the cold chain — how their crate reaches the local market at its best quality and its least waste.' },
      tags:    { ar: ['تسعير', 'تغليف', 'سلسلة التبريد'],
                 en: ['Pricing', 'Packaging', 'Cold chain'] },
    },
    {
      id: 'ambassadors', accent: '#5171FF', sky: ['#0D1330', '#2A3570'], theme: 'dark',
      label:   { ar: 'السفراء', en: 'The Ambassadors' },
      eyebrow: { ar: 'وفي نهاية الرحلة', en: 'And at the end of the flight' },
      title:   { ar: 'تتخرّج سفيراً، لا متدرّباً', en: 'You graduate an ambassador, not a trainee' },
      body:    { ar: 'يعود كل سفير إلى مدرسته أو جامعته أو مزرعة عائلته ليدرّب غيره. وهذا هو المقياس الحقيقي: كم شخصاً زرع بعدك.',
                 en: 'Every ambassador returns to their school, their university, or the family farm to train someone else. That is the real metric: how many people planted after you.' },
      tags:    { ar: [], en: [] },
      cta: {
        primary:   { label: { ar: 'سجّل الآن', en: 'Apply now' }, href: '#apply' },
        secondary: { label: { ar: 'اعرف المسارات', en: 'See the tracks' }, href: '#tracks' },
      },
    },
  ];

  /* ---- بقية الصفحة تحت الرحلة · the grounded page below the flight ------- */
  const TRACKS = [
    { icon: 'chip',  accent: '#35A0C4',
      name: { ar: 'الزراعة الذكية', en: 'Smart Farming' },
      desc: { ar: 'حسّاسات التربة، وأنظمة الريّ المبرمجة، ولوحات البيانات التي تحوّل المزرعة إلى قرارٍ مبني على رقم.',
              en: 'Soil sensors, programmed irrigation, and the dashboards that turn a farm into a decision backed by a number.' } },
    { icon: 'drop',  accent: '#2FA36B',
      name: { ar: 'الاستدامة المائية', en: 'Water Sustainability' },
      desc: { ar: 'حساب البصمة المائية للمحصول، وإعادة استخدام المياه الرمادية، وهندسة الفلج بمنطقه القديم وأدواته الجديدة.',
              en: 'Crop water footprints, greywater reuse, and falaj engineering — its old logic with its new instruments.' } },
    { icon: 'seed',  accent: '#D98E3B',
      name: { ar: 'ريادة الأعمال الزراعية', en: 'Agri-entrepreneurship' },
      desc: { ar: 'من فكرة إلى صندوقٍ في السوق: التكلفة، والتسعير، والعلامة، والوصول إلى المشتري المحلي.',
              en: 'From an idea to a crate on a shelf: cost, pricing, brand, and reaching the local buyer.' } },
  ];

  const PHASES = [
    { n: '01', name: { ar: 'التسجيل والاختيار', en: 'Apply & select' },
      when: { ar: 'أسبوعان', en: '2 weeks' },
      desc: { ar: 'استمارة قصيرة ومقابلة. لا نطلب خبرة سابقة — نطلب الرغبة والالتزام بالحضور.',
              en: 'A short form and an interview. No prior experience required — we ask for willingness and attendance.' } },
    { n: '02', name: { ar: 'المعسكر التدريبي', en: 'Training camp' },
      when: { ar: '٦ أسابيع', en: '6 weeks' },
      desc: { ar: 'ورش عملية في المشتل والمختبر، ومسارٌ يختاره السفير من المسارات الثلاثة.',
              en: 'Hands-on workshops in the nursery and the lab, plus one of the three tracks, chosen by the ambassador.' } },
    { n: '03', name: { ar: 'المشروع الميداني', en: 'Field project' },
      when: { ar: 'موسم زراعي', en: 'One growing season' },
      desc: { ar: 'قطعة أرض حقيقية لكل فريق، مع مرشدٍ زراعي ومتابعة أسبوعية للبيانات.',
              en: 'A real plot per team, an agronomy mentor, and a weekly review of the data.' } },
    { n: '04', name: { ar: 'التخرّج والشبكة', en: 'Graduation & network' },
      when: { ar: 'مستمر', en: 'Ongoing' },
      desc: { ar: 'شهادة سفير، ودعوة لتدريب دفعةٍ جديدة، وعضوية دائمة في شبكة الخريجين.',
              en: 'An ambassador certificate, an invitation to train the next cohort, and permanent alumni membership.' } },
  ];

  /* أرقام مستهدفة — ليست إنجازات محقّقة. عدّلها بأرقامكم الحقيقية.
     Target figures — NOT achieved results. Replace with your real numbers. */
  const TARGETS = [
    { value: '٥٠٠',  valueEn: '500',  label: { ar: 'سفير في الدفعة الأولى', en: 'ambassadors in cohort one' } },
    { value: '٢٥',   valueEn: '25',   label: { ar: 'مدرسة وجامعة شريكة',   en: 'partner schools & universities' } },
    { value: '٣٠٪',  valueEn: '30%',  label: { ar: 'خفض مستهدف في مياه الريّ', en: 'target cut in irrigation water' } },
    { value: '٢٠٥١', valueEn: '2051', label: { ar: 'رؤية الأمن الغذائي الوطني', en: 'national food security vision' } },
  ];

  const UI = {
    hint:        { ar: 'مرّر للطيران في العالم', en: 'scroll to fly through the world' },
    skip:        { ar: 'تخطّي الرحلة',            en: 'skip the flight' },
    langLabel:   { ar: 'English',                 en: 'العربية' },
    tracksKicker:{ ar: 'المسارات', en: 'The tracks' },
    tracksLede:  { ar: 'كل سفير يتدرّب على الأساسيات كاملة، ثم يتعمّق في مسارٍ واحد يختاره بنفسه ويبني عليه مشروعه الميداني.',
                   en: 'Every ambassador covers the full fundamentals, then goes deep in one self-chosen track and builds their field project on it.' },
    phasesKicker:{ ar: 'المراحل', en: 'The phases' },
    targetsKicker:{ ar: 'أهدافنا', en: 'Our goals' },
    applyKicker: { ar: 'التسجيل', en: 'Apply' },
    tracksTitle: { ar: 'ثلاثة مسارات، يختار السفير واحداً', en: 'Three tracks — each ambassador picks one' },
    phasesTitle: { ar: 'الرحلة في أربع مراحل',    en: 'The journey, in four phases' },
    targetsTitle:{ ar: 'أهدافنا للدفعة الأولى',    en: 'Our goals for the first cohort' },
    targetsNote: { ar: 'هذه أهداف معلنة للبرنامج، وليست نتائج محقّقة بعد.',
                   en: 'These are the programme’s stated goals, not results achieved yet.' },
    applyTitle:  { ar: 'سجّل في الدفعة القادمة',   en: 'Apply to the next cohort' },
    applyShort:  { ar: 'سجّل',                    en: 'Apply' },
    applyBody:   { ar: 'اترك بياناتك وسنراسلك عند فتح باب التسجيل. لا نطلب خبرةً سابقة.',
                   en: 'Leave your details and we’ll write to you when applications open. No prior experience needed.' },
    fName:       { ar: 'الاسم الكامل',   en: 'Full name' },
    fEmail:      { ar: 'البريد الإلكتروني', en: 'Email address' },
    fAge:        { ar: 'العمر',          en: 'Age' },
    fTrack:      { ar: 'المسار المفضّل',  en: 'Preferred track' },
    fSubmit:     { ar: 'أرسل الطلب',     en: 'Send application' },
    fDone:       { ar: 'وصلنا طلبك — هذا نموذج تجريبي، لا يُرسل بيانات إلى أي خادم.',
                   en: 'Got it — this is a demo form; nothing is sent to any server.' },
    footNote:    { ar: 'نموذج أوّلي. النصوص والأرقام مقترحة للتعديل.',
                   en: 'Prototype. Copy and figures are proposals, meant to be edited.' },
    backToTop:   { ar: 'إلى الأعلى', en: 'Back to top' },
  };

  return { BRAND, SCENES, TRACKS, PHASES, TARGETS, UI };
})();
