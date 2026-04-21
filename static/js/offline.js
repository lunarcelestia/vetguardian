(function () {
  var btnRef = document.getElementById("btnOpenRef");
  var btnTest = document.getElementById("btnOpenTest");
  var panelHome = document.getElementById("panelHome");
  var panelRef = document.getElementById("panelRef");
  var panelTest = document.getElementById("panelTest");
  var btnBackRef = document.getElementById("btnBackFromRef");
  var btnBackTest = document.getElementById("btnBackFromTest");
  var form = document.getElementById("quickTestForm");
  var resultEl = document.getElementById("testResult");

  function showPanel(panel) {
    panelHome.classList.remove("is-open");
    panelRef.classList.remove("is-open");
    panelTest.classList.remove("is-open");
    panel.classList.add("is-open");
    window.scrollTo(0, 0);
  }

  if (btnRef) {
    btnRef.addEventListener("click", function () {
      showPanel(panelRef);
    });
  }
  if (btnTest) {
    btnTest.addEventListener("click", function () {
      showPanel(panelTest);
      resultEl.classList.remove("is-visible", "level-low", "level-mid", "level-high");
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

  function scoreFromSelect(id) {
    var el = document.getElementById(id);
    return el ? parseInt(el.value, 10) || 0 : 0;
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var breath = scoreFromSelect("qBreath");
      var mind = scoreFromSelect("qMind");
      var bleed = scoreFromSelect("qBleed");
      var gi = scoreFromSelect("qGi");
      var pain = scoreFromSelect("qPain");
      var total = breath + mind + bleed + gi + pain;

      var title;
      var text;
      var levelClass;

      if (total >= 7) {
        levelClass = "level-high";
        title = "Высокая срочность";
        text =
          "Сочетание признаков может указывать на угрозу жизни. Немедленно обратитесь в ближайшую ветклинику или вызовите врача на дом. До приезда не кормите и по возможности сохраняйте спокойствие питомца.";
      } else if (total >= 4) {
        levelClass = "level-mid";
        title = "Средняя срочность";
        text =
          "Состояние требует оценки ветеринара в ближайшие часы. Следите за дыханием и сознанием, не давайте лекарств без назначения. При ухудшении — срочно в клинику.";
      } else {
        levelClass = "level-low";
        title = "Относительно стабильно";
        text =
          "По ответам видимых критических признаков мало, но это не замена осмотра. При появлении слабости, рвоты, судорог или кровотечения — немедленно к врачу.";
      }

      resultEl.className = "test-result is-visible " + levelClass;
      resultEl.querySelector("[data-result-title]").textContent = title;
      resultEl.querySelector("[data-result-body]").textContent = text;
    });
  }
})();
