(function () {
  "use strict";

  var KM = typeof window !== "undefined" ? window.VGKnowledgeMatch : null;

  var btnRef = document.getElementById("btnOpenRef");
  var btnTest = document.getElementById("btnOpenTest");
  var panelHome = document.getElementById("panelHome");
  var panelRef = document.getElementById("panelRef");
  var panelTest = document.getElementById("panelTest");
  var panelClinics = document.getElementById("panelClinics");
  var btnBackRef = document.getElementById("btnBackFromRef");
  var btnBackTest = document.getElementById("btnBackFromTest");
  var btnOpenClinics = document.getElementById("btnOpenClinics");
  var btnBackFromClinics = document.getElementById("btnBackFromClinics");
  var clinicsCityStep = document.getElementById("clinicsCityStep");
  var clinicsListStep = document.getElementById("clinicsListStep");
  var clinicsHotline = document.getElementById("clinicsHotline");
  var clinicsDistrictNav = document.getElementById("clinicsDistrictNav");
  var clinicsDistrictBlocks = document.getElementById("clinicsDistrictBlocks");
  var btnClinicsChangeCity = document.getElementById("btnClinicsChangeCity");

  var clinicsData = null;

  var testRoot = document.getElementById("offlineTestRoot");
  var testIntro = document.getElementById("offlineTestIntro");
  var testCategoryBtns = document.getElementById("offlineTestCategories");
  var testQuestionWrap = document.getElementById("offlineTestQuestion");
  var testQuestionText = document.getElementById("offlineTestQuestionText");
  var testOptions = document.getElementById("offlineTestOptions");
  var testBack = document.getElementById("offlineTestBack");
  var testResult = document.getElementById("offlineTestResult");
  var testResultLevel = document.getElementById("offlineTestResultLevel");
  var testResultBody = document.getElementById("offlineTestResultBody");
  var testResultActions = document.getElementById("offlineTestResultActions");
  var testRefLink = document.getElementById("offlineTestRefLink");
  var testRestart = document.getElementById("offlineTestRestart");

  var kb = null;
  var kbLoadError = null;

  /** Категории: якорь справочника + whitelist id из БЗ + ветвление вопросов */
  var OFFLINE_CATEGORIES = [
    {
      id: "bleeding",
      label: "Кровотечения",
      anchor: "ref-bleeding",
      primarySeed: "кровотечение кровь рана травма",
      conditionIds: [
        "hemorrhagic_gastro",
        "wound_infection",
        "trauma_general_petsure",
        "trauma_ortho",
        "observation",
      ],
      questions: [
        {
          text: "Откуда идёт кровь?",
          options: [
            {
              label: "Из раны на коже / после травмы",
              answers: {
                b3_has_wound: "yes",
                b4_related: "Была травма (падение, удар)",
              },
              primaryBits: "рана кожа",
            },
            {
              label: "Со стула или из прямой кишки",
              answers: { b3_stool_blood: "yes", b3_diarrhea: "1" },
              primaryBits: "кровь кал стул",
            },
            {
              label: "Изо рта / с рвотой",
              answers: { b3_vomit: "2", b3_stool_blood: "yes" },
              primaryBits: "рвота кровь",
            },
          ],
        },
        {
          text: "Кровотечение сильное (не останавливается или большая потеря)?",
          options: [
            {
              label: "Да",
              answers: {
                b3_wound_size: "большая (более 5 см)",
                b3_wound_depth: "глубокая",
              },
              primaryBits: "сильное",
            },
            {
              label: "Нет, умеренное или слабое",
              answers: { b3_wound_size: "маленькая (до 2 см)" },
              primaryBits: "слабое",
            },
          ],
        },
        {
          text: "Цвет крови в кале или рвоте",
          options: [
            { label: "Ярко-алая", answers: {}, primaryBits: "алая кровь" },
            {
              label: "Тёмная, дёгтеобразная",
              answers: { b3_stool_black: "yes" },
              primaryBits: "дегтеобразный стул",
            },
            { label: "Не знаю / только наружная рана", answers: {}, primaryBits: "" },
          ],
        },
        {
          text: "Питомец в сознании, реагирует на вас?",
          options: [
            { label: "Да, бодрый", answers: { b3_lethargy: "0" }, primaryBits: "" },
            { label: "Вялый", answers: { b3_lethargy: "1" }, primaryBits: "вялость" },
            {
              label: "Почти не откликается",
              answers: { b3_lethargy: "2" },
              primaryBits: "угнетение",
            },
          ],
        },
      ],
    },
    {
      id: "poisoning",
      label: "Отравления",
      anchor: "ref-poisoning",
      primarySeed: "отравление токсин рвота",
      conditionIds: [
        "poisoning",
        "self_medication_complication",
        "pancreatitis_suspect",
        "gastroenteritis_acute_petsure",
        "mild_gi_upset",
        "foreign_body",
        "observation",
      ],
      questions: [
        {
          text: "Что мог питомец съесть или получить?",
          options: [
            {
              label: "Подобрал на улице / неизвестно",
              answers: { b4_related: "Съел что-то на улице" },
              primaryBits: "улица",
            },
            {
              label: "Новая еда или лакомство",
              answers: { b4_related: "Дали новую еду" },
              primaryBits: "еда",
            },
            {
              label: "Лекарства или бытовая химия человека",
              answers: { b4_self_medication: "Да" },
              primaryBits: "лекарство",
            },
          ],
        },
        {
          text: "Есть рвота?",
          options: [
            { label: "Нет или один раз", answers: { b3_vomit: "0" }, primaryBits: "" },
            { label: "Несколько раз", answers: { b3_vomit: "2" }, primaryBits: "рвота" },
            { label: "Постоянная рвота", answers: { b3_vomit: "3" }, primaryBits: "сильная рвота" },
          ],
        },
        {
          text: "Понос?",
          options: [
            { label: "Нет", answers: { b3_diarrhea: "0" }, primaryBits: "" },
            { label: "Да", answers: { b3_diarrhea: "1" }, primaryBits: "понос" },
            { label: "Жидкий частый", answers: { b3_diarrhea: "2" }, primaryBits: "диарея" },
          ],
        },
        {
          text: "Вялость?",
          options: [
            { label: "Нет", answers: { b3_lethargy: "0" }, primaryBits: "" },
            { label: "Да", answers: { b3_lethargy: "1" }, primaryBits: "вялость" },
            { label: "Сильная", answers: { b3_lethargy: "2" }, primaryBits: "сильная вялость" },
          ],
        },
      ],
    },
    {
      id: "trauma",
      label: "Травмы",
      anchor: "ref-trauma",
      primarySeed: "травма падение удар",
      conditionIds: [
        "trauma_general_petsure",
        "trauma_ortho",
        "wound_infection",
        "foreign_body",
        "ivdd_spinal_issue_petsure",
        "observation",
      ],
      questions: [
        {
          text: "Была явная травма (удар, падение, укус)?",
          options: [
            {
              label: "Да",
              answers: { b4_related: "Была травма (падение, удар)" },
              primaryBits: "травма",
            },
            { label: "Не уверены", answers: {}, primaryBits: "" },
          ],
        },
        {
          text: "Есть открытая рана?",
          options: [
            {
              label: "Да",
              answers: { b3_has_wound: "yes", b3_wound_depth: "поверхностная" },
              primaryBits: "рана",
            },
            { label: "Нет", answers: { b3_has_wound: "no" }, primaryBits: "" },
          ],
        },
        {
          text: "Хромота или боль при движении?",
          options: [
            { label: "Нет", answers: { b3_limping: "0" }, primaryBits: "" },
            { label: "Да", answers: { b3_limping: "1" }, primaryBits: "хромота" },
            { label: "Сильная, не наступает", answers: { b3_limping: "2" }, primaryBits: "сильная боль" },
          ],
        },
        {
          text: "Трудно встать или лечь?",
          options: [
            { label: "Нет", answers: { b3_hard_stand: "0", b3_hard_lie: "0" }, primaryBits: "" },
            {
              label: "Да",
              answers: { b3_hard_stand: "1", b3_hard_lie: "1" },
              primaryBits: "неврология спина",
            },
          ],
        },
      ],
    },
    {
      id: "neuro",
      label: "Неврологические симптомы",
      anchor: "ref-neuro",
      primarySeed: "судороги неврология тремор",
      conditionIds: [
        "epilepsy_seizure",
        "ivdd_spinal_issue_petsure",
        "stress_behavior",
        "observation",
      ],
      questions: [
        {
          text: "Были судороги или потеря сознания?",
          options: [
            {
              label: "Да, судороги",
              answers: { b3_trembling: "2" },
              primaryBits: "судороги",
            },
            {
              label: "Тремор без полной потери сознания",
              answers: { b3_trembling: "1" },
              primaryBits: "тремор",
            },
            { label: "Нет", answers: { b3_trembling: "0" }, primaryBits: "" },
          ],
        },
        {
          text: "Шаткая походка или слабость лап?",
          options: [
            { label: "Нет", answers: { b3_wobbly: "0" }, primaryBits: "" },
            { label: "Да", answers: { b3_wobbly: "1" }, primaryBits: "атаксия" },
          ],
        },
        {
          text: "Вялость?",
          options: [
            { label: "Нет", answers: { b3_lethargy: "0" }, primaryBits: "" },
            { label: "Да", answers: { b3_lethargy: "1" }, primaryBits: "вялость" },
          ],
        },
      ],
    },
    {
      id: "resp",
      label: "Проблемы дыхания",
      anchor: "ref-resp",
      primarySeed: "одышка дыхание кашель",
      conditionIds: [
        "dyspnea",
        "respiratory_infection",
        "cardiac_respiratory_pattern",
        "boas_brachycephalic_petsure",
        "upper_respiratory_complex",
        "observation",
      ],
      questions: [
        {
          text: "Затруднённое дыхание или хрипы?",
          options: [
            {
              label: "Сильное затруднение",
              answers: { b3_breathing_hard: "2", b3_wheezing: "1" },
              primaryBits: "одышка",
            },
            {
              label: "Умеренное",
              answers: { b3_breathing_hard: "1", b3_shortness: "1" },
              primaryBits: "",
            },
            { label: "Нет", answers: { b3_breathing_hard: "0" }, primaryBits: "" },
          ],
        },
        {
          text: "Кашель?",
          options: [
            { label: "Нет", answers: { b3_cough: "0" }, primaryBits: "" },
            { label: "Да", answers: { b3_cough: "1" }, primaryBits: "кашель" },
            { label: "Сильный", answers: { b3_cough: "2" }, primaryBits: "сильный кашель" },
          ],
        },
        {
          text: "Чихание или выделения из носа?",
          options: [
            { label: "Нет", answers: { b3_sneeze: "0" }, primaryBits: "" },
            {
              label: "Да",
              answers: { b3_sneeze: "1", b3_nose_discharge: "yes" },
              primaryBits: "ринит",
            },
          ],
        },
      ],
    },
    {
      id: "gi",
      label: "Проблемы ЖКТ",
      anchor: "ref-gi",
      primarySeed: "рвота понос желудок кишечник",
      conditionIds: [
        "gastroenteritis_acute_petsure",
        "colitis_mucus",
        "gastritis",
        "pancreatitis_suspect",
        "mild_gi_upset",
        "poisoning",
        "foreign_body",
        "constipation_severe",
        "hepatobiliary_hint",
        "observation",
      ],
      questions: [
        {
          text: "Рвота?",
          options: [
            { label: "Нет", answers: { b3_vomit: "0" }, primaryBits: "" },
            { label: "Была", answers: { b3_vomit: "1" }, primaryBits: "рвота" },
            { label: "Частая", answers: { b3_vomit: "2" }, primaryBits: "частая рвота" },
          ],
        },
        {
          text: "Понос?",
          options: [
            { label: "Нет", answers: { b3_diarrhea: "0" }, primaryBits: "" },
            { label: "Да", answers: { b3_diarrhea: "1" }, primaryBits: "понос" },
            { label: "Со слизью или кровью", answers: { b3_diarrhea: "1", b3_stool_mucus: "yes" }, primaryBits: "слизь кровь" },
          ],
        },
        {
          text: "Подбирал еду на улице?",
          options: [
            {
              label: "Да",
              answers: { b4_related: "Съел что-то на улице", b2_behavior: "Любит подбирать с земли" },
              primaryBits: "улица",
            },
            { label: "Нет / неизвестно", answers: {}, primaryBits: "" },
          ],
        },
        {
          text: "Вялость или отказ от еды?",
          options: [
            {
              label: "Нет",
              answers: { b3_lethargy: "0", b3_appetite_refusal: "0" },
              primaryBits: "",
            },
            {
              label: "Да",
              answers: { b3_lethargy: "1", b3_appetite_refusal: "1" },
              primaryBits: "вялость аппетит",
            },
          ],
        },
      ],
    },
    {
      id: "urinary",
      label: "Проблемы мочевыделения",
      anchor: "ref-urinary",
      primarySeed: "моча мочеиспускание инфекция",
      conditionIds: [
        "uti",
        "blockage_urinary",
        "kidney_concern",
        "diabetes_concern",
        "dehydration_risk",
        "observation",
      ],
      questions: [
        {
          text: "Питомец не может помочиться или мочится каплями?",
          options: [
            {
              label: "Да",
              answers: { b3_cannot_urinate: "yes" },
              primaryBits: "задержка мочи",
            },
            { label: "Нет", answers: {}, primaryBits: "" },
          ],
        },
        {
          text: "Болезненное мочеиспускание или частые позывы?",
          options: [
            {
              label: "Да",
              answers: { b3_urinate_pain: "yes", b3_urinate_more: "yes" },
              primaryBits: "цистит",
            },
            { label: "Нет", answers: {}, primaryBits: "" },
          ],
        },
        {
          text: "Кровь в моче?",
          options: [
            { label: "Да", answers: { b3_blood_urine: "yes" }, primaryBits: "гематурия" },
            { label: "Нет", answers: {}, primaryBits: "" },
          ],
        },
        {
          text: "Жажда и объём мочи изменились?",
          options: [
            {
              label: "Пьёт больше, мочится чаще",
              answers: { b3_drink_more: "1", b3_urinate_more: "yes" },
              primaryBits: "полидипсия",
            },
            { label: "Без сильных изменений", answers: {}, primaryBits: "" },
          ],
        },
      ],
    },
    {
      id: "skin",
      label: "Кожные проблемы",
      anchor: "ref-skin",
      primarySeed: "зуд кожа аллергия высыпания",
      conditionIds: [
        "allergy_skin",
        "skin_infection_petsure",
        "skin_masses_petsure",
        "observation",
      ],
      questions: [
        {
          text: "Зуд или расчёсы?",
          options: [
            { label: "Нет", answers: {}, primaryBits: "" },
            { label: "Да", answers: { b3_itch: "yes" }, primaryBits: "зуд" },
          ],
        },
        {
          text: "Покраснение, сыпь, гнойнички?",
          options: [
            {
              label: "Да, несколько признаков",
              answers: { b3_redness: "yes", b3_rash: "yes", b3_wounds: "yes" },
              primaryBits: "дерматит",
            },
            { label: "Нет или слабо", answers: {}, primaryBits: "" },
          ],
        },
        {
          text: "Уплотнения или шишки на коже?",
          options: [
            { label: "Да", answers: { b3_lumps: "yes" }, primaryBits: "опухоль кожи" },
            { label: "Нет", answers: {}, primaryBits: "" },
          ],
        },
      ],
    },
    {
      id: "heat",
      label: "Тепловой удар",
      anchor: "ref-heat",
      primarySeed: "тепловой удар перегрев жара обезвоживание",
      conditionIds: [
        "dehydration_risk",
        "dyspnea",
        "stress_behavior",
        "observation",
      ],
      questions: [
        {
          text: "Перегрев на солнце или в машине?",
          options: [
            { label: "Да", answers: { b3_lethargy: "1" }, primaryBits: "перегрев" },
            { label: "Нет / не уверены", answers: {}, primaryBits: "" },
          ],
        },
        {
          text: "Одышка или слабость?",
          options: [
            {
              label: "Да",
              answers: { b3_shortness: "1", b3_breathing_hard: "1" },
              primaryBits: "одышка",
            },
            { label: "Нет", answers: { b3_shortness: "0" }, primaryBits: "" },
          ],
        },
        {
          text: "Рвота или понос после жары?",
          options: [
            { label: "Да", answers: { b3_vomit: "1", b3_diarrhea: "1" }, primaryBits: "" },
            { label: "Нет", answers: {}, primaryBits: "" },
          ],
        },
      ],
    },
    {
      id: "seizures",
      label: "Судороги / эпилепсия",
      anchor: "ref-seizures",
      primarySeed: "эпилепсия судороги приступ",
      conditionIds: ["epilepsy_seizure", "stress_behavior", "observation"],
      questions: [
        {
          text: "Известна ли эпилепсия у питомца?",
          options: [
            { label: "Да", answers: { b1_chronic: "Эпилепсия" }, primaryBits: "эпилепсия" },
            { label: "Нет", answers: { b1_chronic: "Нет" }, primaryBits: "" },
          ],
        },
        {
          text: "Длительность приступа (примерно)?",
          options: [
            { label: "Менее 2 минут", answers: { b3_trembling: "1" }, primaryBits: "" },
            { label: "Дольше или повторы подряд", answers: { b3_trembling: "2" }, primaryBits: "длительные судороги" },
          ],
        },
        {
          text: "После приступа питомец приходит в себя?",
          options: [
            { label: "Да", answers: { b3_lethargy: "0" }, primaryBits: "" },
            { label: "Долго вялый", answers: { b3_lethargy: "1" }, primaryBits: "постиктальная вялость" },
          ],
        },
      ],
    },
    {
      id: "bites",
      label: "Укусы / жала",
      anchor: "ref-bites",
      primarySeed: "укус змея насекомое жало отёк",
      conditionIds: ["wound_infection", "trauma_general_petsure", "allergy_skin", "observation"],
      questions: [
        {
          text: "Есть прокол или рана?",
          options: [
            {
              label: "Да",
              answers: { b3_has_wound: "yes", b4_related: "Была травма (падение, удар)" },
              primaryBits: "укус рана",
            },
            { label: "Только отёк / зуд без раны", answers: { b3_itch: "yes", b3_redness: "yes" }, primaryBits: "аллергия укус" },
          ],
        },
        {
          text: "Отёк быстро растёт или затруднено дыхание?",
          options: [
            {
              label: "Да",
              answers: { b3_shortness: "1", b3_wheezing: "1" },
              primaryBits: "анафилаксия подозрение",
            },
            { label: "Нет", answers: {}, primaryBits: "" },
          ],
        },
        {
          text: "Известен ли вид животного (змея, паук)?",
          options: [
            { label: "Змея / ядовитое", answers: {}, primaryBits: "змея яд" },
            { label: "Собака/кошка/неизвестно", answers: {}, primaryBits: "укус животное" },
          ],
        },
      ],
    },
    {
      id: "eyes",
      label: "Глазные симптомы",
      anchor: "ref-eyes",
      primarySeed: "глаз конъюнктивит выделения",
      conditionIds: ["conjunctivitis", "eye_condition_severe", "observation"],
      questions: [
        {
          text: "Выделения или покраснение?",
          options: [
            {
              label: "Лёгкие выделения",
              answers: { b3_eyes_discharge: "yes", b3_eyes_red: "yes" },
              primaryBits: "конъюнктивит",
            },
            {
              label: "Мутность, сильный отёк",
              answers: { b3_eyes_cloudy: "yes", b3_third_eyelid: "yes" },
              primaryBits: "глаз остро",
            },
            { label: "Нет", answers: {}, primaryBits: "" },
          ],
        },
        {
          text: "Третий век заметен?",
          options: [
            { label: "Да", answers: { b3_third_eyelid: "yes" }, primaryBits: "" },
            { label: "Нет", answers: {}, primaryBits: "" },
          ],
        },
      ],
    },
    {
      id: "cardiac",
      label: "Сердце и кашель",
      anchor: "ref-cardiac",
      primarySeed: "сердце кашель одышка недостаточность",
      conditionIds: ["cardiac_respiratory_pattern", "dyspnea", "respiratory_infection", "observation"],
      questions: [
        {
          text: "Кашель, особенно ночью или после нагрузки?",
          options: [
            { label: "Да", answers: { b3_cough: "1" }, primaryBits: "кашель" },
            { label: "Нет", answers: { b3_cough: "0" }, primaryBits: "" },
          ],
        },
        {
          text: "Одышка в покое?",
          options: [
            { label: "Да", answers: { b3_shortness: "1", b3_lethargy: "1" }, primaryBits: "одышка" },
            { label: "Нет", answers: {}, primaryBits: "" },
          ],
        },
        {
          text: "Известны болезни сердца?",
          options: [
            { label: "Да", answers: { b1_chronic: "Болезни сердца" }, primaryBits: "сердце" },
            { label: "Нет", answers: { b1_chronic: "Нет" }, primaryBits: "" },
          ],
        },
      ],
    },
  ];

  var state = {
    cat: null,
    qIndex: 0,
    mergedAnswers: {},
    primaryParts: [],
    /** История шагов для корректного «Назад» */
    answerPatches: [],
    primaryPatches: [],
  };

  function showPanel(panel) {
    if (!panelHome || !panel) return;
    panelHome.classList.remove("is-open");
    if (panelRef) panelRef.classList.remove("is-open");
    if (panelTest) panelTest.classList.remove("is-open");
    if (panelClinics) panelClinics.classList.remove("is-open");
    panel.classList.add("is-open");
    window.scrollTo(0, 0);
  }

  function mergeAnswers(base, patch) {
    var out = {};
    var k;
    for (k in base) {
      if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    }
    for (k in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) out[k] = patch[k];
    }
    return out;
  }

  function resetTestUi() {
    state.cat = null;
    state.qIndex = 0;
    state.mergedAnswers = {};
    state.primaryParts = [];
    state.answerPatches = [];
    state.primaryPatches = [];
    if (testIntro) testIntro.hidden = false;
    if (testQuestionWrap) testQuestionWrap.hidden = true;
    if (testResult) {
      testResult.hidden = true;
      testResult.className = "offline-test-result";
    }
    if (testCategoryBtns) testCategoryBtns.innerHTML = "";
    if (testOptions) testOptions.innerHTML = "";
    if (testRefLink) {
      testRefLink.hidden = true;
      testRefLink.setAttribute("href", "#");
    }
  }

  function renderCategoryButtons() {
    if (!testCategoryBtns) return;
    testCategoryBtns.innerHTML = "";
    OFFLINE_CATEGORIES.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "offline-test-cat-btn";
      b.textContent = c.label;
      b.addEventListener("click", function () {
        startCategory(c);
      });
      testCategoryBtns.appendChild(b);
    });
  }

  function rebuildMergedFromHistory() {
    state.mergedAnswers = {};
    state.primaryParts = state.cat ? [state.cat.primarySeed] : [];
    for (var i = 0; i < state.answerPatches.length; i++) {
      state.mergedAnswers = mergeAnswers(state.mergedAnswers, state.answerPatches[i] || {});
    }
    for (var j = 0; j < state.primaryPatches.length; j++) {
      var p = state.primaryPatches[j];
      if (p && String(p).trim()) state.primaryParts.push(String(p).trim());
    }
  }

  function startCategory(cat) {
    state.cat = cat;
    state.qIndex = 0;
    state.answerPatches = [];
    state.primaryPatches = [];
    state.mergedAnswers = {};
    state.primaryParts = [cat.primarySeed];
    if (testIntro) testIntro.hidden = true;
    if (testQuestionWrap) testQuestionWrap.hidden = false;
    if (testResult) testResult.hidden = true;
    renderQuestion();
  }

  function renderQuestion() {
    var cat = state.cat;
    if (!cat || !testQuestionText || !testOptions) return;
    var qs = cat.questions || [];
    if (state.qIndex >= qs.length) {
      runEvaluate();
      return;
    }
    var q = qs[state.qIndex];
    testQuestionText.textContent = q.text;
    testOptions.innerHTML = "";
    if (testBack) testBack.style.display = state.qIndex > 0 ? "inline-flex" : "none";

    q.options.forEach(function (opt, idx) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "offline-test-opt-btn";
      btn.textContent = opt.label;
      btn.addEventListener("click", function () {
        state.answerPatches.push(opt.answers || {});
        state.primaryPatches.push((opt.primaryBits && String(opt.primaryBits).trim()) || "");
        rebuildMergedFromHistory();
        state.qIndex += 1;
        renderQuestion();
      });
      testOptions.appendChild(btn);
    });
  }

  function runEvaluate() {
    if (!KM || !kb) {
      showErrorFallback();
      return;
    }
    var primary = state.primaryParts.filter(Boolean).join(" ");
    var cat = state.cat;
    var res = KM.evaluateForCategory(
      state.mergedAnswers,
      primary,
      kb,
      cat.conditionIds
    );

    if (testQuestionWrap) testQuestionWrap.hidden = true;
    if (testResult) testResult.hidden = false;

    var level = res.danger_level || "green";
    testResult.className = "offline-test-result is-visible level-" + level;
    var levelLabel =
      level === "red"
        ? "Высокая срочность (красный)"
        : level === "yellow"
          ? "Требуется визит к врачу (жёлтый)"
          : "Относительно низкий риск (зелёный)";
    if (testResultLevel) testResultLevel.textContent = levelLabel;

    var top = (res.conditions && res.conditions[0]) || null;
    var html = "";
    if (top) {
      html +=
        "<p><strong>Вероятное состояние (по базе знаний):</strong> " +
        escapeHtml(top.name) +
        " (~" +
        Math.round((top.probability || 0) * 100) +
        "%)</p>";
      if (top.description) {
        html += "<p>" + escapeHtml(top.description) + "</p>";
      }
    }
    if (res.summary) {
      html += "<pre class=\"offline-test-summary\">" + escapeHtml(res.summary) + "</pre>";
    }
    if (res.immediate_actions && res.immediate_actions.length) {
      html += "<p><strong>Что делать сейчас:</strong></p><ul>";
      res.immediate_actions.forEach(function (a) {
        html += "<li>" + escapeHtml(a) + "</li>";
      });
      html += "</ul>";
    }
    if (testResultBody) testResultBody.innerHTML = html;

    if (testRefLink && cat.anchor) {
      testRefLink.href = "#" + cat.anchor;
      testRefLink.hidden = false;
    }
  }

  function escapeHtml(s) {
    if (s == null) return "";
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function showErrorFallback() {
    if (testQuestionWrap) testQuestionWrap.hidden = true;
    if (testResult) {
      testResult.hidden = false;
      testResult.className = "offline-test-result is-visible level-yellow";
    }
    if (testResultLevel) testResultLevel.textContent = "Не удалось загрузить базу";
    if (testResultBody) {
      testResultBody.innerHTML =
        "<p>" +
        escapeHtml(
          kbLoadError ||
            "Проверьте, что файл veterinary_knowledge_offline.json доступен (кеш PWA или откройте страницу онлайн один раз)."
        ) +
        "</p>";
    }
    if (testRefLink) {
      testRefLink.hidden = true;
      testRefLink.setAttribute("href", "#");
    }
  }

  function loadKnowledge() {
    return fetch("/js/veterinary_knowledge_offline.json", { cache: "force-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        kb = data;
        kbLoadError = null;
      })
      .catch(function (e) {
        kb = null;
        kbLoadError = (e && e.message) || String(e);
        console.warn("[offline] knowledge load failed:", e);
      });
  }

  if (btnRef) {
    btnRef.addEventListener("click", function () {
      showPanel(panelRef);
    });
  }
  if (btnTest) {
    btnTest.addEventListener("click", function () {
      showPanel(panelTest);
      resetTestUi();
      renderCategoryButtons();
    });
  }
  if (btnBackRef) {
    btnBackRef.addEventListener("click", function () {
      showPanel(panelHome);
    });
  }
  if (btnBackTest) {
    btnBackTest.addEventListener("click", function () {
      showPanel(panelHome);
    });
  }

  if (testRefLink) {
    testRefLink.addEventListener("click", function (e) {
      e.preventDefault();
      var href = (testRefLink.getAttribute("href") || "").trim();
      if (!href || href === "#") return;
      var id = href.indexOf("#") === 0 ? href.slice(1) : "";
      if (!id || !panelRef) return;
      showPanel(panelRef);
      window.setTimeout(function () {
        var el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          try {
            window.history.replaceState(null, "", "#" + id);
          } catch (errNav) {}
        }
      }, 180);
    });
  }

  function resetClinicsPanel() {
    if (clinicsCityStep) clinicsCityStep.hidden = false;
    if (clinicsListStep) clinicsListStep.hidden = true;
  }

  function renderClinicsForCity(cityKey) {
    var city = clinicsData && clinicsData[cityKey];
    if (!city || !clinicsHotline || !clinicsDistrictNav || !clinicsDistrictBlocks) return;
    clinicsHotline.textContent = "Единый номер: " + (city.hotline || "");
    clinicsDistrictNav.innerHTML = "";
    (city.districts || []).forEach(function (dist) {
      var a = document.createElement("a");
      a.href = "#offline-clinic-" + dist.id;
      a.className = "offline-clinics-nav-link";
      a.textContent = dist.name;
      clinicsDistrictNav.appendChild(a);
    });
    clinicsDistrictBlocks.innerHTML = "";
    (city.districts || []).forEach(function (dist) {
      var section = document.createElement("section");
      section.className = "offline-clinic-district";
      section.id = "offline-clinic-" + dist.id;
      var h = document.createElement("h3");
      h.className = "offline-clinic-district-title";
      h.textContent = dist.name;
      section.appendChild(h);
      var ul = document.createElement("ul");
      ul.className = "offline-clinic-list";
      (dist.clinics || []).forEach(function (c) {
        var li = document.createElement("li");
        li.className = "offline-clinic-item";
        var img = document.createElement("img");
        img.src = "/pictures/paw.png";
        img.alt = "";
        img.width = 22;
        img.height = 22;
        img.decoding = "async";
        var body = document.createElement("div");
        body.className = "offline-clinic-item-body";
        var nm = document.createElement("strong");
        nm.className = "offline-clinic-name";
        nm.textContent = c.name || "";
        body.appendChild(nm);
        if (c.address) {
          var addr = document.createElement("p");
          addr.className = "offline-clinic-addr";
          addr.textContent = c.address;
          body.appendChild(addr);
        }
        if (c.phone) {
          var ph = document.createElement("p");
          ph.className = "offline-clinic-phone";
          var tel = document.createElement("a");
          tel.href = "tel:" + String(c.phone).replace(/\s/g, "");
          tel.textContent = c.phone;
          ph.appendChild(tel);
          body.appendChild(ph);
        }
        li.appendChild(img);
        li.appendChild(body);
        ul.appendChild(li);
      });
      section.appendChild(ul);
      clinicsDistrictBlocks.appendChild(section);
    });
    if (clinicsCityStep) clinicsCityStep.hidden = true;
    if (clinicsListStep) clinicsListStep.hidden = false;
  }

  function loadClinicsData(done) {
    if (clinicsData) {
      if (done) done(clinicsData);
      return;
    }
    fetch("/offline_clinics.json", { cache: "force-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (d) {
        clinicsData = d;
        if (done) done(clinicsData);
      })
      .catch(function (e) {
        console.warn("[offline] clinics load failed:", e);
        clinicsData = null;
        if (done) done(null);
      });
  }

  if (btnOpenClinics && panelClinics) {
    btnOpenClinics.addEventListener("click", function () {
      showPanel(panelClinics);
      resetClinicsPanel();
      loadClinicsData(null);
    });
  }
  if (btnBackFromClinics) {
    btnBackFromClinics.addEventListener("click", function () {
      showPanel(panelHome);
      resetClinicsPanel();
    });
  }
  if (btnClinicsChangeCity) {
    btnClinicsChangeCity.addEventListener("click", function () {
      resetClinicsPanel();
    });
  }

  document.querySelectorAll("[data-offline-city]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var key = btn.getAttribute("data-offline-city");
      loadClinicsData(function (data) {
        if (!data || !data[key]) {
          if (clinicsDistrictBlocks) {
            clinicsDistrictBlocks.innerHTML =
              "<p class=\"offline-clinics-error\">Не удалось загрузить список. Проверьте кеш или подключение при первой загрузке страницы.</p>";
          }
          if (clinicsCityStep) clinicsCityStep.hidden = true;
          if (clinicsListStep) clinicsListStep.hidden = false;
          return;
        }
        renderClinicsForCity(key);
      });
    });
  });

  if (testBack) {
    testBack.addEventListener("click", function () {
      if (state.qIndex > 0) {
        state.qIndex -= 1;
        state.answerPatches.pop();
        state.primaryPatches.pop();
        rebuildMergedFromHistory();
        renderQuestion();
      }
    });
  }

  if (testRestart) {
    testRestart.addEventListener("click", function () {
      resetTestUi();
      renderCategoryButtons();
    });
  }

  if (!KM) {
    console.warn("[offline] VGKnowledgeMatch не загружен — подключите knowledge_match.js раньше offline.js");
  }

  loadKnowledge();

  if (testCategoryBtns && panelTest && panelTest.classList.contains("is-open")) {
    renderCategoryButtons();
  }
})();
