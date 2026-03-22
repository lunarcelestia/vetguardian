(function () {
  "use strict";

  const API = "/api";
  const TOKEN_KEY = "vetguardian_token";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }
  function setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function authHeaders() {
    const t = getToken();
    return t ? { Authorization: "Bearer " + t } : {};
  }

  // ——— Шапка: Войти / Аватар ———
  const headerLoginBtn = document.getElementById("headerLoginBtn");
  const headerAvatarBtn = document.getElementById("headerAvatarBtn");
  const navCabinetBtn = document.getElementById("navCabinet");
  function updateHeaderAuth() {
    var t = getToken();
    if (headerLoginBtn) headerLoginBtn.style.display = t ? "none" : "inline-block";
    if (headerAvatarBtn) headerAvatarBtn.style.display = t ? "inline-block" : "none";
  }
  if (headerLoginBtn) headerLoginBtn.addEventListener("click", function () { document.getElementById("authModal").classList.add("open"); });
  if (headerAvatarBtn) headerAvatarBtn.addEventListener("click", showCabinet);
  if (navCabinetBtn) navCabinetBtn.addEventListener("click", showCabinet);
  updateHeaderAuth();

  // ——— Навигация шапки ———
  var anamnesisOverlay = document.getElementById("anamnesisOverlay");
  if (document.getElementById("navAnalysis")) document.getElementById("navAnalysis").addEventListener("click", openAnamnesisModal);
  if (document.getElementById("navClinics")) document.getElementById("navClinics").addEventListener("click", function () { document.getElementById("clinicsSection").scrollIntoView({ behavior: "smooth" }); });
  if (document.getElementById("navBreeds")) document.getElementById("navBreeds").addEventListener("click", function () {
    var petSection = document.getElementById("petInfoSection");
    if (petSection) petSection.scrollIntoView({ behavior: "smooth" });
  });

  // ——— Мобильное меню: выдвижная панель справа ———
  var mobileMenuBtn = document.getElementById("mobileMenuBtn");
  var mobileNavOverlay = document.getElementById("mobileNavOverlay");
  var mobileNavClose = document.getElementById("mobileNavClose");
  function closeMobileNav() {
    document.body.classList.remove("mobile-nav-open");
  }
  function openMobileNav() {
    document.body.classList.add("mobile-nav-open");
  }
  if (mobileMenuBtn) mobileMenuBtn.addEventListener("click", openMobileNav);
  if (mobileNavOverlay) mobileNavOverlay.addEventListener("click", closeMobileNav);
  if (mobileNavClose) mobileNavClose.addEventListener("click", closeMobileNav);
  document.querySelectorAll(".mobile-nav-link").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var action = btn.getAttribute("data-action");
      if (action === "analysis") openAnamnesisModal();
      else if (action === "clinics") document.getElementById("clinicsSection").scrollIntoView({ behavior: "smooth" });
      else if (action === "breeds") {
        var petSection = document.getElementById("petInfoSection");
        if (petSection) petSection.scrollIntoView({ behavior: "smooth" });
      } else if (action === "cabinet") showCabinet();
      closeMobileNav();
    });
  });

  // ——— Фон при прокрутке ———
  var scrollBgOverlay = document.getElementById("scrollBgOverlay");
  if (scrollBgOverlay) {
    window.addEventListener("scroll", function () {
      var y = window.scrollY || document.documentElement.scrollTop;
      var opacity = Math.min(1, Math.max(0, (y - 300) / 500));
      scrollBgOverlay.style.opacity = opacity;
    });
  }

  // ——— Модальное окно анамнеза (пошагово) ———
  const stageTitle = document.getElementById("stageTitle");
  const progressFill = document.getElementById("progressFill");
  const stepQuestionnaire = document.getElementById("stepQuestionnaire");
  const stepExtra = document.getElementById("stepExtra");
  const stepPhoto = document.getElementById("stepPhoto");
  const stepLoading = document.getElementById("stepLoading");
  const stepResult = document.getElementById("stepResult");
  const anamnesisCloseBtn = document.getElementById("anamnesisCloseBtn");
  const questionBlocks = document.querySelectorAll(".block-step");
  var currentQuestionBlock = 1;
  var totalQuestionBlocks = questionBlocks.length || 0;

  function setStep(stepName, percent) {
    if (stepQuestionnaire) stepQuestionnaire.style.display = stepName === "questionnaire" ? "block" : "none";
    if (stepExtra) stepExtra.style.display = stepName === "extra" ? "block" : "none";
    if (stepPhoto) stepPhoto.style.display = stepName === "photo" ? "block" : "none";
    if (stepLoading) stepLoading.style.display = stepName === "loading" ? "block" : "none";
    if (stepResult) stepResult.style.display = stepName === "result" ? "block" : "none";
    if (stageTitle) {
      var titles = { questionnaire: "Опросник", extra: "Дополнительная информация", photo: "Загрузка фото", loading: "Сбор анамнеза", result: "" };
      stageTitle.textContent = titles[stepName] || "";
    }
    if (progressFill) progressFill.style.width = (percent || 0) + "%";
  }

  function resetQuestionBlocks() {
    currentQuestionBlock = 1;
    if (!questionBlocks || !questionBlocks.length) return;
    questionBlocks.forEach(function (b) {
      var step = parseInt(b.getAttribute("data-step") || "0", 10);
      b.style.display = (step === 1) ? "block" : "none";
    });
  }

  function openAnamnesisModal() {
    if (anamnesisOverlay) anamnesisOverlay.classList.add("open");
    document.body.classList.add("body-locked");
    setStep("questionnaire", 25);
    resetQuestionBlocks();
    selectedPhotoFiles = [];
    if (photoPreview) photoPreview.innerHTML = "";
    if (extraTextEl) extraTextEl.value = "";
  }

  const anamnesisTrigger = document.getElementById("anamnesisTrigger");
  if (anamnesisTrigger) anamnesisTrigger.addEventListener("click", function (e) { e.preventDefault(); openAnamnesisModal(); });

  if (document.getElementById("btnToExtra")) document.getElementById("btnToExtra").addEventListener("click", function () {
    if (totalQuestionBlocks > 0 && currentQuestionBlock < totalQuestionBlocks) {
      currentQuestionBlock += 1;
      questionBlocks.forEach(function (b) {
        var step = parseInt(b.getAttribute("data-step") || "0", 10);
        b.style.display = (step === currentQuestionBlock) ? "block" : "none";
      });
      var pct = 25 + (currentQuestionBlock - 1) * (25 / totalQuestionBlocks);
      setStep("questionnaire", pct);
    } else {
      setStep("extra", 50);
    }
  });
  if (document.getElementById("btnToPhoto")) document.getElementById("btnToPhoto").addEventListener("click", function () { setStep("photo", 75); });

  // Подвопросы раны: показывать только при выборе "Да"
  var woundYes = document.getElementById("woundYes");
  var woundNo = document.getElementById("woundNo");
  var woundSub = document.getElementById("woundSub");
  if (woundYes && woundSub) woundYes.addEventListener("change", function () { woundSub.classList.toggle("visible", true); });
  if (woundNo && woundSub) woundNo.addEventListener("change", function () { woundSub.classList.toggle("visible", false); });

  const questionnaireWrap = document.getElementById("stepQuestionnaire");
  function showQuestionnaire() { openAnamnesisModal(); }

  // ——— Сбор ответов формы ———
  function getFormAnswers(form) {
    const data = {};
    const els = form.querySelectorAll("input, select, textarea");
    els.forEach(function (el) {
      const name = el.name;
      if (!name) return;
      if (el.type === "radio" || el.type === "checkbox") {
        if (el.type === "checkbox") {
          if (el.checked) data[name] = el.value || "yes";
        } else {
          if (el.checked) data[name] = el.value;
        }
      } else if (el.type !== "submit" && el.type !== "button") {
        const v = el.value && el.value.trim();
        if (v) data[name] = v;
      }
    });
    return data;
  }

  // ——— Взаимоисключение «В норме» для групп чекбоксов ———
  function setupExclusiveNormalCheckboxes() {
    var groups = document.querySelectorAll(".radio-inline[data-exclusive-normal][data-normal-name]");
    if (!groups || !groups.length) return;
    groups.forEach(function (wrap) {
      var normalName = wrap.getAttribute("data-normal-name");
      if (!normalName) return;
      var normal = wrap.querySelector('input[type="checkbox"][name="' + normalName + '"]');
      var others = wrap.querySelectorAll('input[type="checkbox"]:not([name="' + normalName + '"])');
      if (!normal) return;

      function uncheckOthers() {
        others.forEach(function (o) { o.checked = false; });
      }
      function uncheckNormal() {
        normal.checked = false;
      }

      normal.addEventListener("change", function () {
        if (normal.checked) uncheckOthers();
      });
      others.forEach(function (o) {
        o.addEventListener("change", function () {
          if (o.checked) uncheckNormal();
        });
      });
    });
  }

  setupExclusiveNormalCheckboxes();

  // ——— Фото и кнопка «Отправить анамнез» ———
  const submitAnamnesisWrap = document.getElementById("submitAnamnesisWrap");
  const addPhotoBtn = document.getElementById("addPhotoBtn");
  const skipPhotoBtn = document.getElementById("skipPhotoBtn");
  const photoInput = document.getElementById("photoInput");
  const photoPreview = document.getElementById("photoPreview");
  const extraTextEl = document.getElementById("extraText");
  var selectedPhotoFiles = [];

  function showSubmitAnamnesisBtn() {
    if (submitAnamnesisWrap) {
      submitAnamnesisWrap.classList.add("visible");
      submitAnamnesisWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  if (addPhotoBtn && photoInput) {
    addPhotoBtn.addEventListener("click", function () { photoInput.click(); });
    photoInput.addEventListener("change", function () {
      var files = this.files || [];
      for (var i = 0; i < files.length; i++) {
        selectedPhotoFiles.push(files[i]);
        (function (file) {
          var reader = new FileReader();
          reader.onload = function (e) {
            var div = document.createElement("div");
            div.className = "photo-preview-item";
            div.innerHTML = "<img src=\"" + e.target.result + "\" alt=\"\"><button type=\"button\" class=\"remove-photo\" aria-label=\"Удалить\">×</button>";
            div.querySelector(".remove-photo").addEventListener("click", function () {
              selectedPhotoFiles = selectedPhotoFiles.filter(function (f) { return f !== file; });
              div.remove();
            });
            photoPreview.appendChild(div);
          };
          reader.readAsDataURL(file);
        })(files[i]);
      }
      this.value = "";
      showSubmitAnamnesisBtn();
    });
  }
  if (skipPhotoBtn) skipPhotoBtn.addEventListener("click", showSubmitAnamnesisBtn);

  if (anamnesisCloseBtn && anamnesisOverlay) {
    anamnesisCloseBtn.addEventListener("click", function () {
      anamnesisOverlay.classList.remove("open");
      document.body.classList.remove("body-locked");
    });
  }

  // Условные дополнительные поля (появляются при выборе "Да"/"Другое")
  var conditionalInputs = document.querySelectorAll(".conditional-input");
  if (conditionalInputs.length) {
    conditionalInputs.forEach(function (wrap) {
      wrap.style.display = "none";
      var forName = wrap.getAttribute("data-for");
      var showOn = wrap.getAttribute("data-show-on") || "";
      if (!forName) return;
      var inputs = document.querySelectorAll('input[name="' + forName + '"]');
      function updateVisibility() {
        var shouldShow = false;
        inputs.forEach(function (inp) {
          if (inp.checked) {
            if (!showOn || inp.value === showOn) shouldShow = true;
          }
        });
        if (shouldShow) {
          wrap.style.display = "block";
        } else {
          wrap.style.display = "none";
        }
      }
      inputs.forEach(function (inp) {
        inp.addEventListener("change", updateVisibility);
      });
    });
  }

  // ——— Отправка опросника (анамнез + ИИ) ———
  const questionnaireForm = document.getElementById("questionnaireForm");
  const loadingWrap = document.getElementById("loadingWrap");
  const resultWrap = document.getElementById("resultWrap");
  const resultLevel = document.getElementById("resultLevel");
  const resultSummary = document.getElementById("resultSummary");
  const resultConditions = document.getElementById("resultConditions");
  const resultActions = document.getElementById("resultActions");
  const aiReportContent = document.getElementById("aiReportContent");
  const aiReportFrame = document.getElementById("aiReportFrame");
  const submitBtn = document.getElementById("submitBtn");

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var s = reader.result;
        if (s && s.indexOf("base64,") !== -1) s = s.split("base64,")[1];
        resolve(s || "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener("click", function (e) {
      e.preventDefault();
      runAnamnesisSubmit();
    });
  }

  function runAnamnesisSubmit() {
    const answers = getFormAnswers(questionnaireForm);
    const extra_text = extraTextEl ? (extraTextEl.value || "").trim() : "";
    setStep("loading", 90);
    if (submitBtn) submitBtn.disabled = true;

    Promise.all(selectedPhotoFiles.map(fileToBase64))
      .then(function (photosBase64) {
        return fetch(API + "/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ answers: answers, extra_text: extra_text, photos: photosBase64 }),
        });
      })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (submitBtn) submitBtn.disabled = false;
        if (res.ok && res.result) {
          setStep("result", 100);
          showResult(res.result);
          // обновляем историю на главной
          loadHistoryStrip();
          // и в личном кабинете, если он сейчас открыт
          if (cabinetSection && cabinetSection.classList.contains("visible")) {
            showCabinet();
          }
        } else {
          alert(res.error || "Ошибка при анализе");
          setStep("photo", 75);
        }
      })
      .catch(function (err) {
        if (submitBtn) submitBtn.disabled = false;
        alert("Ошибка сети");
        setStep("photo", 75);
      });
  }

  if (document.getElementById("btnCloseSave")) {
    document.getElementById("btnCloseSave").addEventListener("click", function () {
      if (anamnesisOverlay) anamnesisOverlay.classList.remove("open");
      document.body.classList.remove("body-locked");
      loadHistoryStrip();
    });
  }

  function showResult(result) {
    const level = result.danger_level || "green";
    const levelText = { green: "🟢 ЗЕЛЕНЫЙ: Наблюдайте дома. Рекомендации по уходу.", yellow: "🟡 ЖЕЛТЫЙ: Плановый визит к врачу. Запись на прием.", red: "🔴 КРАСНЫЙ: СРОЧНО в клинику!" };
    if (resultLevel) {
      resultLevel.textContent = levelText[level] || levelText.green;
      resultLevel.className = "result-level " + level;
    }
    var summary = result.summary || "";
    if (resultSummary) resultSummary.innerHTML = escapeHtml(summary).replace(/\n/g, "<br>");
    if (resultConditions) {
      const conds = result.conditions || [];
      resultConditions.innerHTML = conds.length
        ? "<h4>Вероятные состояния</h4><ul>" + conds.map(function (c) {
          return "<li><strong>" + escapeHtml(c.name) + "</strong> (" + Math.round((c.probability || 0) * 100) + "%): " + escapeHtml(c.description || "") + "</li>";
        }).join("") + "</ul>"
        : "";
    }
    if (resultActions) {
      const actions = result.immediate_actions || [];
      resultActions.innerHTML = actions.length
        ? "<h4>Что делать сейчас</h4><ul>" + actions.map(function (a) { return "<li>" + escapeHtml(a) + "</li>"; }).join("") + "</ul>"
        : "";
    }
    var aiText = result.ai_response || "";
    if (aiText) {
      // убираем лишние маркеры Markdown (#, *, -, **)
      aiText = aiText.replace(/^[#]+[ \t]*/gm, "");        // заголовки
      aiText = aiText.replace(/^[ \t]*[-*][ \t]+/gm, "");  // маркеры списков
      aiText = aiText.replace(/\*\*(.*?)\*\*/g, "$1");     // жирный текст **...**
    }
    if (aiReportContent) aiReportContent.innerHTML = escapeHtml(aiText).replace(/\n/g, "<br>");
    if (aiReportFrame) aiReportFrame.style.display = aiText ? "block" : "none";
    if (stepResult && stepResult.style.display === "block") {
      stepResult.scrollTop = 0;
    } else if (resultWrap) {
      resultWrap.classList.add("visible");
      resultWrap.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function escapeHtml(s) {
    if (!s) return "";
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  /**
   * Форматирование текстов статей из БД/Excel:
   * - табуляция и выравнивание: white-space: pre-wrap на блоках;
   * - **жирный**, *курсив* (после экранирования HTML);
   * - списки: строки, начинающиеся с "- ", "• ", "· ", "1. ", "1) " или "* " (звёздочка + пробел);
   * - пустая строка разделяет абзацы.
   */
  function applyInlineArticleFormatting(line) {
    if (line == null) return "";
    var e = escapeHtml(String(line));
    e = e.replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");
    e = e.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
    return e;
  }

  /** Одна строка или несколько (переносы) — **жирный**, *курсив*, табы сохраняются через pre-wrap на родителе */
  function formatInlineMultiline(raw) {
    if (raw == null || raw === "") return "";
    return String(raw)
      .split(/\r?\n/)
      .map(applyInlineArticleFormatting)
      .join("<br>");
  }

  function formatArticleRichText(raw) {
    if (raw == null || raw === "") return "";
    var lines = String(raw).split(/\r?\n/);
    var out = [];
    var paraBuf = [];
    var listBuf = [];

    function flushPara() {
      if (paraBuf.length) {
        var inner = paraBuf.map(applyInlineArticleFormatting).join("<br>");
        out.push('<div class="article-rich-block">' + inner + "</div>");
        paraBuf = [];
      }
    }
    function flushList() {
      if (listBuf.length) {
        out.push(
          '<ul class="article-rich-list">' +
            listBuf
              .map(function (item) {
                return "<li>" + applyInlineArticleFormatting(item) + "</li>";
              })
              .join("") +
            "</ul>"
        );
        listBuf = [];
      }
    }

    function isListLine(line) {
      return (
        /^\s*(?:[-•·]|(?:\d+[\.\)]))\s+/.test(line) ||
        /^\s*\*\s+/.test(line)
      );
    }

    function stripListMarker(line) {
      return line
        .replace(/^\s*(?:[-•·]|(?:\d+[\.\)]))\s+/, "")
        .replace(/^\s*\*\s+/, "")
        .trim();
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();
      if (trimmed === "") {
        flushList();
        flushPara();
        continue;
      }
      if (isListLine(line)) {
        flushPara();
        listBuf.push(stripListMarker(line));
      } else {
        flushList();
        paraBuf.push(line);
      }
    }
    flushList();
    flushPara();

    if (!out.length) return "";
    return '<div class="article-rich-content">' + out.join("") + "</div>";
  }

  // ——— История на главной ———
  const historyStrip = document.getElementById("historyStrip");
  const historyEmpty = document.getElementById("historyEmpty");
  function loadHistoryStrip() {
    if (!historyStrip) return;
    if (!getToken()) {
      // для неавторизованных просто показываем пустой текст без запроса
      historyStrip.querySelectorAll(".history-card").forEach(function (c) { c.remove(); });
      if (historyEmpty) historyEmpty.style.display = "inline";
      return;
    }
    fetch(API + "/history", { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        const items = res.ok ? (res.items || []) : [];
        if (items.length === 0) {
          if (historyEmpty) historyEmpty.style.display = "inline";
          historyStrip.querySelectorAll(".history-card").forEach(function (c) { c.remove(); });
        } else {
          if (historyEmpty) historyEmpty.style.display = "none";
          historyStrip.querySelectorAll(".history-card").forEach(function (c) { c.remove(); });
          items.forEach(function (it) {
            const card = document.createElement("div");
            card.className = "history-card";
            card.dataset.caseId = String(it.id);
            const levelCl = it.danger_level || "green";
            card.innerHTML = "<span class=\"date\">" + escapeHtml(formatDate(it.created_at)) + "</span><div class=\"level " + levelCl + "\">" + (levelCl === "red" ? "Срочно" : levelCl === "yellow" ? "Планово" : "Наблюдение") + "</div><div>" + escapeHtml((it.summary || "").slice(0, 80)) + "</div>";
            card.addEventListener("click", function () {
              openHistoryCase(it.id);
            });
            historyStrip.appendChild(card);
          });
        }
      })
      .catch(function () {});
  }
  function formatDate(s) {
    if (!s) return "";
    try {
      const d = new Date(s);
      return isNaN(d.getTime()) ? s : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (_) { return s; }
  }
  loadHistoryStrip();

  // ——— Личный кабинет ———
  const mainContent = document.getElementById("mainContent");
  const cabinetSection = document.getElementById("cabinetSection");
  const cabinetHistoryList = document.getElementById("cabinetHistoryList");
  const cabinetBtn = document.getElementById("cabinetBtn");
  const backToMainBtn = document.getElementById("backToMainBtn");

  function showCabinet() {
    if (!getToken()) {
      document.getElementById("authModal").classList.add("open");
      return;
    }
    // элементы паспорта
    var petNameSpan = document.getElementById("cabinetPetName");
    var petBreedSpan = document.getElementById("cabinetPetBreed");
    var petEmailSpan = document.getElementById("cabinetEmail");

    fetch(API + "/me", { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok || !res.user) {
          // токен невалиден — сбрасываем и просим войти
          setToken(null);
          updateHeaderAuth();
          if (cabinetSection) cabinetSection.classList.remove("visible");
          document.getElementById("authModal").classList.add("open");
          throw new Error("unauthorized");
        }

        if (petNameSpan) petNameSpan.textContent = res.user.name || "—";
        if (petBreedSpan) petBreedSpan.textContent = (res.user.breed || "—");
        if (petEmailSpan) petEmailSpan.textContent = res.user.email || "—";

        if (cabinetSection) {
          cabinetSection.classList.add("visible");
        }

        // подгружаем историю, но это не блокирует показ паспорта
        return fetch(API + "/history", { headers: authHeaders() });
      })
      .then(function (r) { return r ? r.json() : null; })
      .then(function (res) {
        if (!res || !res.ok) return;
        const items = res.items || [];
        if (cabinetHistoryList) {
          cabinetHistoryList.innerHTML = items.length === 0
            ? "<li>История пуста. Пройдите опрос «Составить анамнез».</li>"
            : items.map(function (it) {
              const levelCl = it.danger_level || "green";
              return "<li data-case-id=\"" + String(it.id) + "\"><span class=\"date\">" + escapeHtml(formatDate(it.created_at)) + "</span> <span class=\"level " + levelCl + "\">" + (levelCl === "red" ? "Срочно" : levelCl === "yellow" ? "Планово" : "Наблюдение") + "</span><br>" + escapeHtml(it.summary || "") + "</li>";
            }).join("");

          // навешиваем обработчики клика на элементы истории в кабинете
          Array.prototype.forEach.call(cabinetHistoryList.querySelectorAll("li[data-case-id]"), function (li) {
            li.addEventListener("click", function () {
              var id = parseInt(li.getAttribute("data-case-id") || "0", 10);
              if (id) openHistoryCase(id);
            });
          });
        }
      })
      .catch(function () { /* уже обработано выше или история не критична */ });
  }

  function hideCabinet() {
    if (cabinetSection) cabinetSection.classList.remove("visible");
  }

  cabinetBtn && cabinetBtn.addEventListener("click", showCabinet);
  backToMainBtn && backToMainBtn.addEventListener("click", hideCabinet);
  var cabinetCloseBtn = document.getElementById("cabinetCloseBtn");
  cabinetCloseBtn && cabinetCloseBtn.addEventListener("click", hideCabinet);
  var cabinetLogoutBtn = document.getElementById("cabinetLogoutBtn");
  if (cabinetLogoutBtn) {
    cabinetLogoutBtn.addEventListener("click", function () {
      setToken(null);
      updateHeaderAuth();
      hideCabinet();
      // очищаем историю на главной
      if (historyStrip) {
        historyStrip.querySelectorAll(".history-card").forEach(function (c) { c.remove(); });
      }
      if (historyEmpty) historyEmpty.style.display = "inline";
      document.getElementById("authModal").classList.add("open");
    });
  }

  // Открытие сохранённого кейса из истории
  function openHistoryCase(caseId) {
    fetch(API + "/history/" + encodeURIComponent(caseId), { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok || !res.item || !res.item.result) return;
        // показываем результат в уже существующей панели
        setStep("result", 100);
        showResult(res.item.result);
        if (anamnesisOverlay) anamnesisOverlay.classList.add("open");
      })
      .catch(function () { });
  }

  // ——— Модалка входа/регистрации ———
  const authModal = document.getElementById("authModal");
  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  document.querySelectorAll(".modal-tabs button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".modal-tabs button").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      if (btn.getAttribute("data-tab") === "register") {
        loginTab.style.display = "none";
        registerTab.style.display = "block";
      } else {
        loginTab.style.display = "block";
        registerTab.style.display = "none";
      }
    });
  });

  function closeAuthModal() {
    authModal.classList.remove("open");
  }
  document.getElementById("closeAuthModal") && document.getElementById("closeAuthModal").addEventListener("click", closeAuthModal);
  document.getElementById("closeAuthModal2") && document.getElementById("closeAuthModal2").addEventListener("click", closeAuthModal);

  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const fd = new FormData(loginForm);
      var emailVal = (fd.get("email") || "").toString();
      if (emailVal) localStorage.setItem("vetguardian_email", emailVal);
      fetch(API + "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailVal, password: fd.get("password") }),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.ok && res.token) {
            setToken(res.token);
            closeAuthModal();
            loadHistoryStrip();
            updateHeaderAuth();
            // сразу открываем личный кабинет после успешного входа
            showCabinet();
          } else {
            alert(res.error || "Ошибка входа");
          }
        })
        .catch(function () { alert("Ошибка сети"); });
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const fd = new FormData(registerForm);
      const pass = fd.get("password");
      if (pass !== fd.get("password_confirm")) {
        alert("Пароли не совпадают");
        return;
      }
      var petName = (fd.get("name") || "").toString();
      var petBreed = ""; // поле породы можно добавить позже
      var emailVal = (fd.get("email") || "").toString();
      if (petName) localStorage.setItem("vetguardian_pet_name", petName);
      if (emailVal) localStorage.setItem("vetguardian_email", emailVal);
      fetch(API + "/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailVal, password: pass, name: petName, breed: petBreed }),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.ok && res.token) {
            setToken(res.token);
            // после регистрации сразу тянем актуальные данные для паспорта из /me
            closeAuthModal();
            loadHistoryStrip();
            showCabinet();
            updateHeaderAuth();
          } else {
            alert(res.error || "Ошибка регистрации");
          }
        })
        .catch(function () { alert("Ошибка сети"); });
    });
  }

  // ——— Яндекс.Карты: ветклиники (голубые кружки, баллун по тапу) ———
  const citySelect = document.getElementById("citySelect");
  const yandexMapEl = document.getElementById("yandexMap");
  var yandexMapInstance = null;
  var yandexScriptLoaded = false;
  var yandexScriptLoading = null;

  var cityCenters = {
    moscow: { center: [55.75, 37.61], zoom: 10 },
    spb: { center: [59.93, 30.31], zoom: 10 }
  };

  function loadYandexMapsScript(apiKey, callback) {
    if (typeof ymaps !== "undefined") {
      yandexScriptLoaded = true;
      callback();
      return;
    }
    if (yandexScriptLoading) {
      yandexScriptLoading.then(callback);
      return;
    }
    var script = document.createElement("script");
    script.src = "https://api-maps.yandex.ru/2.1/?apikey=" + encodeURIComponent(apiKey) + "&lang=ru_RU";
    script.async = true;
    yandexScriptLoading = new Promise(function (resolve) {
      script.onload = function () {
        yandexScriptLoaded = true;
        resolve();
        callback();
      };
    });
    document.head.appendChild(script);
  }

  function showClinicsOnMap(citySlug, clinics, apiKey) {
    if (!yandexMapEl || !clinics.length) return;
    loadYandexMapsScript(apiKey, function () {
      ymaps.ready(function () {
        if (yandexMapInstance) {
          yandexMapInstance.destroy();
          yandexMapInstance = null;
        }
        var opts = cityCenters[citySlug] || { center: [55.75, 37.61], zoom: 10 };
        yandexMapInstance = new ymaps.Map("yandexMap", {
          center: opts.center,
          zoom: opts.zoom,
          controls: ["zoomControl", "typeSelector", "fullscreenControl"]
        });
        yandexMapEl.setAttribute("data-loaded", "true");
        clinics.forEach(function (c) {
          var body = "<p><strong>Адрес:</strong> " + escapeHtml(c.address || "") + "</p>";
          body += "<p><strong>Режим работы:</strong> " + escapeHtml(c.hours || "") + "</p>";
          body += "<p><strong>Телефон:</strong> " + escapeHtml(c.phone || "—") + "</p>";
          var placemark = new ymaps.Placemark(
            [c.lat, c.lon],
            {
              balloonContentHeader: escapeHtml(c.name || "Клиника"),
              balloonContentBody: body
            },
            { preset: "islands#blueCircleDotIcon" }
          );
          yandexMapInstance.geoObjects.add(placemark);
        });
      });
    });
  }

  if (citySelect && yandexMapEl) {
    citySelect.addEventListener("change", function () {
      var city = (citySelect.value || "").toLowerCase();
      if (city !== "moscow" && city !== "spb") {
        if (yandexMapInstance) {
          yandexMapInstance.destroy();
          yandexMapInstance = null;
        }
        yandexMapEl.setAttribute("data-loaded", "false");
        yandexMapEl.innerHTML = "";
        yandexMapEl.classList.remove("yandex-map-container");
        yandexMapEl.classList.add("yandex-map-container");
        var msg = document.createElement("div");
        msg.style.cssText = "height:100%;display:flex;align-items:center;justify-content:center;color:#6b7280;font-size:15px;padding:20px;text-align:center;";
        msg.textContent = city ? "Клиники для выбранного города пока не добавлены." : "Выберите город (Москва или Санкт-Петербург).";
        yandexMapEl.appendChild(msg);
        return;
      }
      fetch(API + "/config")
        .then(function (r) { return r.json(); })
        .then(function (configRes) {
          var apiKey = (configRes.ok && configRes.yandexMapsApiKey) ? configRes.yandexMapsApiKey : "";
          if (!apiKey) {
            yandexMapEl.innerHTML = "";
            var err = document.createElement("div");
            err.style.cssText = "height:100%;display:flex;align-items:center;justify-content:center;color:#6b7280;font-size:15px;padding:20px;text-align:center;";
            err.textContent = "Не задан ключ Яндекс.Карт (YANDEX_API_KEY).";
            yandexMapEl.appendChild(err);
            return;
          }
          return fetch(API + "/clinics?city=" + encodeURIComponent(city))
            .then(function (r) { return r.json(); })
            .then(function (res) {
              var items = (res.ok && res.items) ? res.items : [];
              yandexMapEl.innerHTML = "";
              yandexMapEl.classList.add("yandex-map-container");
              showClinicsOnMap(city, items, apiKey);
            });
        })
        .catch(function () {
          yandexMapEl.innerHTML = "";
          var err = document.createElement("div");
          err.style.cssText = "height:100%;display:flex;align-items:center;justify-content:center;color:#6b7280;font-size:15px;padding:20px;";
          err.textContent = "Ошибка загрузки карты.";
          yandexMapEl.appendChild(err);
        });
    });
  }

  // ——— Раздел «Статьи» (аналитика по данным из БД) ———
  var articlesByBreedBtn = document.getElementById("articlesByBreedBtn");
  var articlesByAgeBtn = document.getElementById("articlesByAgeBtn");
  var articlesByBehaviorBtn = document.getElementById("articlesByBehaviorBtn");
  var articleByBreed = document.getElementById("articleByBreed");
  var articleByAge = document.getElementById("articleByAge");
  var articleByBehavior = document.getElementById("articleByBehavior");

  var breedListView = document.getElementById("breedListView");
  var breedArticleView = document.getElementById("breedArticleView");
  var breedBackToListBtn = document.getElementById("breedBackToList");
  var breedCurrentName = document.getElementById("breedCurrentName");
  var breedArticleTitle = document.getElementById("breedArticleTitle");
  var breedArticleMainImage = document.getElementById("breedArticleMainImage");
  var breedOverviewText = document.getElementById("breedOverviewText");
  var breedHealthText = document.getElementById("breedHealthText");
  var breedProblemsText = document.getElementById("breedProblemsText");
  var breedHealthChartTitle = document.getElementById("breedHealthChartTitle");

  var ageSelect = document.getElementById("ageSelect");
  var ageListView = document.getElementById("ageListView");
  var ageArticleView = document.getElementById("ageArticleView");
  var ageBackToListBtn = document.getElementById("ageBackToList");
  var ageCurrentName = document.getElementById("ageCurrentName");
  var ageArticleTitle = document.getElementById("ageArticleTitle");
  var ageArticleMainImage = document.getElementById("ageArticleMainImage");
  var ageOverviewText = document.getElementById("ageOverviewText");
  var ageHealthText = document.getElementById("ageHealthText");
  var ageProblemsText = document.getElementById("ageProblemsText");
  var ageHealthChartTitle = document.getElementById("ageHealthChartTitle");

  var behaviorListView = document.getElementById("behaviorListView");
  var behaviorArticleView = document.getElementById("behaviorArticleView");
  var behaviorCarouselTrack = document.getElementById("behaviorCarouselTrack");
  var behaviorScrollPrev = document.getElementById("behaviorScrollPrev");
  var behaviorScrollNext = document.getElementById("behaviorScrollNext");
  var behaviorBackToListBtn = document.getElementById("behaviorBackToList");
  var behaviorCurrentName = document.getElementById("behaviorCurrentName");
  var behaviorArticleTitle = document.getElementById("behaviorArticleTitle");
  var behaviorArticleMainImage = document.getElementById("behaviorArticleMainImage");
  var behaviorChartSourceText = document.getElementById("behaviorChartSourceText");
  var behaviorArticleText = document.getElementById("behaviorArticleText");
  var behaviorFrequencyTitle = document.getElementById("behaviorFrequencyTitle");

  var breedChartSourceText = document.getElementById("breedChartSourceText");
  var ageChartSourceText = document.getElementById("ageChartSourceText");
  var breedChartNote = document.getElementById("breedChartNote");
  var ageChartNote = document.getElementById("ageChartNote");

  // Жёсткий порядок систем органов для медицинских графиков
  var SYSTEM_GROUPS = [
    "Гастроэнтерология",
    "Гепатология/Панкреатология",
    "Дерматология",
    "Инфекции и паразитарные болезни",
    "Кардиология",
    "Нефрология/Урология",
    "Неврология",
    "Онкология",
    "Оториноларингология (ЛОР)",
    "Офтальмология",
    "Пульмонология",
    "Травматология/Ортопедия",
    "Эндокринология"
  ];

  var BREED_IMAGES_BY_ID = {
    16: {
      card: "/pictures/breeds/The golden retriever.png",
      hero: "/pictures/breeds/The golden retriever 2.png"
    }
  };

  // Картинки пород по названию (на случай, если ID в БД отличаются от Excel)
  // ВАЖНО: ключи должны в точности совпадать с breed_name из /api/breeds.
  var BREED_IMAGES_BY_NAME = {
    "Австралийская овчарка": {
      card: "/pictures/breeds/The Australian Shepherd.jpg",
      hero: "/pictures/breeds/The Australian Shepherd 2.png"
    },
    "Акита-ину": {
      card: "/pictures/breeds/Akita inu.jpg",
      hero: "/pictures/breeds/Akita inu 2.jpg"
    },
    "Алабай": {
      card: "/pictures/breeds/alabai.jpg",
      hero: "/pictures/breeds/alabai 2.jpg"
    },
    "Аляскинский маламут": {
      card: "/pictures/breeds/Alaskan malamute.jpg",
      hero: "/pictures/breeds/Alaskan malamute 2.jpg"
    },
    "Золотистый ретривер": {
      card: "/pictures/breeds/The golden retriever.png",
      hero: "/pictures/breeds/The golden retriever 2.png"
    },
    "Английский бульдог": {
        card: "/pictures/breeds/The English Bulldog.jpg",
        hero: "/pictures/breeds/The English Bulldog 2.jpg"
    },
    "Бассет-хаунд": {
        card: "/pictures/breeds/Basset Hound.jpg",
        hero: "/pictures/breeds/Basset Hound 2.jpg"
      },
      "Бигль": {
          card: "/pictures/breeds/The beagle.jpg",
          hero: "/pictures/breeds/The beagle 2.jpg"
      },
      "Бобтейл": {
          card: "/pictures/breeds/bobtail.jpg",
          hero: "/pictures/breeds/bobtail 2.jpg"
      },
      "Боксёр": {
          card: "/pictures/breeds/The boxer.jpg",
          hero: "/pictures/breeds/The boxer 2.jpg"
      },
      "Бордер-колли": {
          card: "/pictures/breeds/border collie.jpg",
          hero: "/pictures/breeds/border collie 2.jpg"
      },
      "Бультерьер": {
          card: "/pictures/breeds/bull terrier.jpeg",
          hero: "/pictures/breeds/bull terrier 2.jpg"
      },
      "Веймаранер": {
          card: "/pictures/breeds/weimaraner.jpeg",
          hero: "/pictures/breeds/weimaraner 2.jpg"
      },
      "Далматин": {
          card: "/pictures/breeds/The Dalmatian.jpg",
          hero: "/pictures/breeds/The Dalmatian 2.jpg"
      },
      "Джек-рассел-терьер": {
          card: "/pictures/breeds/Jack Russell terrier.jpg",
          hero: "/pictures/breeds/Jack Russell terrier 2.jpg"
      },
      "Доберман": {
          card: "/pictures/breeds/The Doberman.jpg",
          hero: "/pictures/breeds/The Doberman 2.jpg"
      },
      "Йоркширский терьер": {
          card: "/pictures/breeds/York.jpg",
          hero: "/pictures/breeds/York 2.jpg"
      },
      "Кане-корсо": {
          card: "/pictures/breeds/cane corso.jpg",
          hero: "/pictures/breeds/cane corso 2.jpeg"
      },
      "Колли (бородатый)": {
          card: "/pictures/breeds/The bearded collie.jpg",
          hero: "/pictures/breeds/The bearded collie 2.jpg"
      },
      "Корги (вельш-корги)": {
          card: "/pictures/breeds/corgi.jpeg",
          hero: "/pictures/breeds/corgi.jpg"
      },
      "Лабрадор-ретривер": {
          card: "/pictures/breeds/Labrador retriever.jpg",
          hero: "/pictures/breeds/Labrador retriever 2.jpg"
      },
      "Мопс": {
          card: "/pictures/breeds/The pug.jpg",
          hero: "/pictures/breeds/The pug 2.jpg"
      },
      "Немецкая овчарка": {
          card: "/pictures/breeds/The German Shepherd.jpg",
          hero: "/pictures/breeds/The German Shepherd 2.jpg"
      },
      "Пекинес": {
          card: "/pictures/breeds/The Pekingese.jpg",
          hero: "/pictures/breeds/The Pekingese 2.jpg"
      },
      "Ротвейлер": {
          card: "/pictures/breeds/The Rottweiler.jpg",
          hero: "/pictures/breeds/The Rottweiler 2.jpg"
      },
      "Такса": {
          card: "/pictures/breeds/dachshund.jpg",
          hero: "/pictures/breeds/dachshund 2.jpg"
      },
      "Хаски": {
          card: "/pictures/breeds/husky.jpg",
          hero: "/pictures/breeds/husky 2.jpg"
      },
      "Чау-чау": {
          card: "/pictures/breeds/chow chow.jpg",
          hero: "/pictures/breeds/chow chow 2.jpg"
      },
      "Шпиц (немецкий/померанский)": {
          card: "/pictures/breeds/The Pomeranian.jpg",
          hero: "/pictures/breeds/The Pomeranian 2.jpeg"
      }
  };

  function getBreedImageConfig(item) {
    if (!item) return {};
    var name = (item.breed_name || "").trim();
    var lower = name.toLowerCase();

    // 1) по ID — только для тех, что явно заданы
    if (BREED_IMAGES_BY_ID[item.id]) {
      return BREED_IMAGES_BY_ID[item.id];
    }

    // 2) по точному имени
    if (BREED_IMAGES_BY_NAME[name]) {
      return BREED_IMAGES_BY_NAME[name];
    }

    // 3) по вхождению ключевых слов, если имя отличается в БД
    if (lower.includes("австралийск")) {
      return BREED_IMAGES_BY_NAME["Австралийская овчарка"] || {};
    }
    if (lower.includes("акита")) {
      return BREED_IMAGES_BY_NAME["Акита-ину"] || {};
    }
    if (lower.includes("алабай") || lower.includes("среднеазиат")) {
      return BREED_IMAGES_BY_NAME["Алабай"] || {};
    }
    if (lower.includes("маламут")) {
      return BREED_IMAGES_BY_NAME["Аляскинский маламут"] || {};
    }
    if (lower.includes("ретривер")) {
      return BREED_IMAGES_BY_NAME["Золотистый ретривер"] || {};
    }
    return {};
  }

  function groupBySystems(freqObj) {
    var labels = [];
    var values = [];
    if (!freqObj) return { labels: labels, values: values };

    // Не мутируем исходный объект, чтобы не портить кэшированные данные
    var src = Object.assign({}, freqObj);

    // Если в данных есть объединённая строка "Гастроэнтерология и дерматология",
    // раскладываем её на две отдельные системы, чтобы каждая была своей строкой.
    if (Object.prototype.hasOwnProperty.call(src, "Гастроэнтерология и дерматология")) {
      var bothVal = src["Гастроэнтерология и дерматология"];
      delete src["Гастроэнтерология и дерматология"];
      if (!Object.prototype.hasOwnProperty.call(src, "Гастроэнтерология")) {
        src["Гастроэнтерология"] = bothVal;
      }
      if (!Object.prototype.hasOwnProperty.call(src, "Дерматология")) {
        src["Дерматология"] = bothVal;
      }
    }
    // Сначала добавляем известные системы в заданном порядке
    SYSTEM_GROUPS.forEach(function (name) {
      if (Object.prototype.hasOwnProperty.call(src, name)) {
        labels.push(name);
        values.push(src[name]);
      }
    });
    // Затем любые дополнительные ключи (если вдруг есть)
    Object.keys(src).forEach(function (k) {
      if (SYSTEM_GROUPS.indexOf(k) === -1) {
        labels.push(k);
        values.push(src[k]);
      }
    });
    return { labels: labels, values: values };
  }
  function clearBreedChartSource() {
    if (breedChartSourceText) breedChartSourceText.innerHTML = "";
    if (breedChartNote) breedChartNote.style.display = "none";
  }

  function setBreedChartSource() {
    if (!breedChartSourceText) return;
    breedChartSourceText.innerHTML =
      "<ul><li>" +
      escapeHtml("PetSure (Australia) 2023 Breed Health Report. Анализ структуры заявлений по наследственным заболеваниям.") +
      "</li></ul>";
    if (breedChartNote) breedChartNote.style.display = "block";
  }

  function clearAgeChartSource() {
    if (ageChartSourceText) ageChartSourceText.innerHTML = "";
    if (ageChartNote) ageChartNote.style.display = "none";
  }

  function setAgeChartSource() {
    if (!ageChartSourceText) return;
    ageChartSourceText.innerHTML = "<ul>" + [
      "1. PetSure (2024). Living with older pets: https://petsure.com.au/knowledge-hub/living-with-older-pets/",
      "2. PetSure (2023). Pet Health Monitor 2023: https://petsure.com.au/pet-health-monitor-2023/",
      "3. PetSure (2024). PetSure launches 2024 Pet Health Monitor report: https://petsure.com.au/media-releases/petsure-2024-pet-health-monitor-report/",
      "4. GapOnly (2024). PetSure launches 2024 Pet Health Monitor report: https://gaponly.com.au/media-releases/pet-health-monitor-report-2024/"
    ].map(function (src) {
      return "<li>" + escapeHtml(src) + "</li>";
    }).join("") + "</ul>";
    if (ageChartNote) ageChartNote.style.display = "block";
  }

  function setBehaviorChartSource() {
    if (!behaviorChartSourceText) return;
    behaviorChartSourceText.innerHTML =
      "<ul><li>" +
      escapeHtml("1: Beaver, B.V. (2024). The prevalence of behavior problems in dogs in the United States. Journal of Veterinary Behavior, 76, 34-39. Исследование проведено на базе данных Dog Aging Project (более 43 517 собак)") +
      "</li></ul>";
  }

  // По умолчанию (до выбора) источники не показываем
  clearBreedChartSource();
  clearAgeChartSource();

  // Картинки возрастных групп (пример): card — в сетке возрастов, hero — в начале статьи
  // ВНИМАНИЕ: ID берётся из /api/ages (age.id), а не из Excel "по порядку".
  var AGE_IMAGES_BY_ID = {
    1: {
      card: "/pictures/ages/puppy.jpg",
      hero: "/pictures/ages/puppy 2.jpg"
    },
    2: {
      card: "/pictures/ages/young.jpg",
      hero: "/pictures/ages/young 2.jpg"
    },
    3: {
      card: "/pictures/ages/adults.jpg",
      hero: "/pictures/ages/adults 2.jpg"
    },
    4: {
      card: "/pictures/ages/elderly.jpg",
      hero: "/pictures/ages/elderly 2.jpg"
    },
    5: {
      card: "/cursor-assets/c__Users_________AppData_Roaming_Cursor_User_workspaceStorage_7c2c2f0f299c795d4c8fadc58472aac5_images_senile-10b5f789-0eae-4620-91ea-7e7e09771ebd.png",
      hero: "/cursor-assets/c__Users_________AppData_Roaming_Cursor_User_workspaceStorage_7c2c2f0f299c795d4c8fadc58472aac5_images_senile_2-08d9a054-b405-4817-af01-9fba05904c20.png"
    }
  };

  // Привязка по названию возрастной группы (на случай несовпадений id/формата)
  var AGE_IMAGES_BY_NAME = {
    "Старческие (12+ лет)": {
      card: "/cursor-assets/c__Users_________AppData_Roaming_Cursor_User_workspaceStorage_7c2c2f0f299c795d4c8fadc58472aac5_images_senile-10b5f789-0eae-4620-91ea-7e7e09771ebd.png",
      hero: "/cursor-assets/c__Users_________AppData_Roaming_Cursor_User_workspaceStorage_7c2c2f0f299c795d4c8fadc58472aac5_images_senile_2-08d9a054-b405-4817-af01-9fba05904c20.png"
    }
  };

  var BEHAVIOR_ORDER = [
    "Проблемы привязанности/разлуки",
    "Агрессия",
    "Страх и тревожность",
    "Поедание кала (копрофагия)",
    "Навязчивый лай",
    "Попытки побега",
    "Поедание травы",
    "Нечистоплотность в доме",
    "Деструктивное поведение"
  ];

  var BEHAVIOR_IMAGES_BY_NAME = {
    "Проблемы привязанности/разлуки": {
      card: "/pictures/behaviors/devotion.jpg",
      hero: "/pictures/behaviors/devotion 2.jpg"
    },
    "Проблема привязанности": {
      card: "/pictures/behaviors/devotion.jpg",
      hero: "/pictures/behaviors/devotion 2.jpg"
      },
      "Агрессия": {
          card: "/pictures/behaviors/aggression.jpeg",
          hero: "/pictures/behaviors/aggression 2.jpg"
      },
      "Страх и тревожность": {
          card: "/pictures/behaviors/fear.jpg",
          hero: "/pictures/behaviors/fear 2.jpg"
      },
      "Поедание кала (копрофагия)": {
          card: "/pictures/behaviors/coprophagy.jpg",
          hero: "/pictures/behaviors/coprophagy 2.jpg"
      },
      "Навязчивый лай": {
          card: "/pictures/behaviors/Barking.jpg",
          hero: "/pictures/behaviors/Barking 2.jpeg"
      },
      "Нечистоплотность в доме": {
          card: "/pictures/behaviors/grubbiness.jpg",
          hero: "/pictures/behaviors/grubbiness 2.jpg"
      },
      "Деструктивное поведение": {
          card: "/pictures/behaviors/destructive behavior.jpeg",
          hero: "/pictures/behaviors/destructive behavior 2.jpg"
      }
  };

  function getAgeImageConfig(item) {
    if (!item) return {};
    var parsedId = parseInt(item.id, 10);
    var idKey = !isNaN(parsedId) ? String(parsedId) : String(item.id).trim();
    var nameKey = (item.age_group || "").trim();
    return AGE_IMAGES_BY_ID[idKey] || AGE_IMAGES_BY_NAME[nameKey] || {};
  }

  function getBehaviorImageConfig(item) {
    if (!item) return {};
    var name = (item.behavior_type || "").trim();
    return BEHAVIOR_IMAGES_BY_NAME[name] || {};
  }

  function normalizeBehaviorName(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s+/g, " ")
      .trim();
  }

  function resolveBehaviorCanonicalName(name) {
    var norm = normalizeBehaviorName(name);
    if (!norm) return "";
    if (norm.indexOf("привязан") !== -1 || norm.indexOf("разлук") !== -1) return "Проблемы привязанности/разлуки";
    if (norm.indexOf("агресс") !== -1) return "Агрессия";
    if (norm.indexOf("страх") !== -1 || norm.indexOf("тревож") !== -1) return "Страх и тревожность";
    if (norm.indexOf("копрофаг") !== -1 || norm.indexOf("поедание кала") !== -1) return "Поедание кала (копрофагия)";
    if (norm.indexOf("лай") !== -1) return "Навязчивый лай";
    if (norm.indexOf("побег") !== -1) return "Попытки побега";
    if (norm.indexOf("поедание травы") !== -1 || norm.indexOf("трава") !== -1) return "Поедание травы";
    if (norm.indexOf("нечистоплот") !== -1 || norm.indexOf("в доме") !== -1) return "Нечистоплотность в доме";
    if (norm.indexOf("деструктив") !== -1) return "Деструктивное поведение";
    return "";
  }

  function buildAltExtCandidates(url) {
    if (!url) return [];
    var raw = String(url);
    // Делаем 3 варианта пробелов:
    // 1) как в исходной строке
    // 2) \u00A0 (non-breaking space) -> обычный пробел
    // 3) обычный пробел -> \u00A0 (на случай, если файл на сервере с NBSP)
    var spaceToNbsp = raw.replace(/ /g, "\u00A0");
    var nbspToSpace = raw.replace(/\u00A0/g, " ");

    var variants = [];
    [raw, nbspToSpace, spaceToNbsp].forEach(function (v) {
      if (variants.indexOf(v) === -1) variants.push(v);
    });

    var out = [];
    variants.forEach(function (v) {
      var lower = v.toLowerCase();
      out.push(v);
      if (lower.endsWith(".jpg")) {
        out.push(v.slice(0, -4) + ".png");
        out.push(v.slice(0, -4) + ".jpeg");
      } else if (lower.endsWith(".png")) {
        out.push(v.slice(0, -4) + ".jpg");
        out.push(v.slice(0, -4) + ".jpeg");
      } else if (lower.endsWith(".jpeg")) {
        out.push(v.slice(0, -5) + ".jpg");
        out.push(v.slice(0, -5) + ".png");
      }
    });

    // уникализация
    var seen = {};
    out = out.filter(function (x) {
      if (seen[x]) return false;
      seen[x] = true;
      return true;
    });

    return out;
  }

  function setImgCandidates(imgEl, candidates) {
    if (!imgEl) return;
    var list = (candidates || []).filter(Boolean);
    // уникализируем
    var seen = {};
    list = list.filter(function (c) {
      if (seen[c]) return false;
      seen[c] = true;
      return true;
    });

    if (!list.length) {
      // если кандидатов нет — не прячем картинку, чтобы избежать "пустого" блока
      imgEl.style.display = "block";
      // очищаем src, чтобы не оставалось изображения от предыдущей группы
      imgEl.src = "";
      return;
    }

    // на случай прошлых ошибок: возвращаем видимость
    imgEl.style.display = "block";

    var idx = 0;
    imgEl.onerror = function () {
      idx += 1;
      if (idx >= list.length) {
        imgEl.onerror = null;
        imgEl.style.display = "none";
        return;
      }
      imgEl.src = list[idx];
    };
    imgEl.src = list[idx];
  }

  var breedsCache = null;
  var agesCache = null;
  var behaviorsCache = null;

  var breedHealthChart = null;
  var ageHealthChart = null;
  // legacy vars (оставлены, чтобы не ломать другие участки, если они ещё где-то остались)
  var ageComplicationsChart = null;
  var ageCareChart = null;
  var behaviorFrequencyChart = null;

  function destroyChart(ref) {
    if (ref && typeof ref.destroy === "function") {
      ref.destroy();
    }
  }

  function animateChartBlock(canvasId) {
    var c = document.getElementById(canvasId);
    if (!c || !c.parentElement) return;
    var block = c.parentElement;
    if (!block.classList.contains("chart-animated")) return;
    block.classList.remove("show");
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        block.classList.add("show");
      });
    });
  }

  function renderHorizontalBarChart(canvasId, labels, data, title) {
    var ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart) return null;

    // перед новой отрисовкой запускаем CSS-анимацию блока-графика
    animateChartBlock(canvasId);

    // Цвета: для графиков "здоровье/особенности" — палитра голубых оттенков.
    // Для остальных графиков — зелёный/жёлтый/красный по проценту.
    var colors;
    if (
      canvasId.indexOf("Trait") !== -1 ||
      canvasId === "behaviorFrequencyChart" ||
      canvasId === "breedHealthChart" ||
      canvasId === "ageHealthChart"
    ) {
      var bluePalette = [
        "rgba(14, 165, 233, 0.45)",
        "rgba(59, 130, 246, 0.45)",
        "rgba(37, 99, 235, 0.35)",
        "rgba(96, 165, 250, 0.45)",
        "rgba(56, 189, 248, 0.40)",
        "rgba(34, 211, 238, 0.35)",
        "rgba(129, 199, 255, 0.45)",
        "rgba(191, 219, 254, 0.50)",
        "rgba(147, 197, 253, 0.45)",
        "rgba(125, 211, 252, 0.40)"
      ];
      colors = data.map(function (_, idx) {
        return bluePalette[idx % bluePalette.length];
      });
    } else {
      // Цвета по уровню процента: зелёный / жёлтый / красный (мягкие, полупрозрачные)
      colors = data.map(function (value) {
        var v = Number(value) || 0;
        if (v < 20) {
          return "rgba(34, 197, 94, 0.5)";      // зелёный до 20%
        } else if (v < 60) {
          return "rgba(234, 179, 8, 0.55)";     // жёлтый до 60%
        } else {
          return "rgba(248, 113, 113, 0.55)";   // красный после 60%
        }
      });
    }

    var fontFamily = '"TT Days Sans", "Segoe UI", sans-serif';

    var datasetConfig = {
      label: title || "",
      data: data,
      backgroundColor: colors,
      borderColor: "rgba(0,0,0,0)", // без жёсткой обводки
      borderWidth: 0,
      borderRadius: {
        topLeft: 4,
        bottomLeft: 4,
        topRight: 999,
        bottomRight: 999
      },
      borderSkipped: "left",
      barThickness: 26,
      categoryPercentage: 0.98,
      barPercentage: 1.0
    };

    return new window.Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [datasetConfig]
      },
      options: {
        responsive: true,
        indexAxis: "y",
        maintainAspectRatio: false,
        layout: {
          padding: { left: 10, right: 18, top: 10, bottom: 10 }
        },
        animation: {
          duration: 1200,
          easing: "easeOutCubic"
        },
        plugins: {
          legend: {
            display: false,
            labels: {
              font: { family: fontFamily, size: 12 }
            }
          },
          tooltip: {
            enabled: true,
            bodyFont: { family: fontFamily, size: 12 },
            titleFont: { family: fontFamily, size: 13, weight: "600" }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { display: false },
            ticks: {
              color: "#0f172a",
              font: { family: fontFamily, size: 11, weight: "600" },
              callback: function (value) {
                return value + "%";
              }
            }
          },
          y: {
            grid: { display: false },
            ticks: {
              display: true,
              color: "#0f172a",
              font: { family: fontFamily, size: 11, weight: "600" }
            }
          }
        }
      },
      plugins: [{
        id: "barLabelPlugin",
        afterDatasetsDraw: function (chart) {
          var ctx = chart.ctx;
          var meta = chart.getDatasetMeta(0);
          var dataset = chart.data.datasets[0];
          ctx.save();
          ctx.fillStyle = "#6b7280";
          var fontFamilyStr = fontFamily;
          var baseFont = "600 16px " + fontFamilyStr;

          meta.data.forEach(function (bar, index) {
            var value = dataset.data[index];
            var y = bar.y + 6;
            ctx.font = baseFont;
            if (typeof value === "number") {
              ctx.textAlign = "right";
              ctx.fillText(Math.round(value) + "%", bar.x - 8, y);
            }
          });
          ctx.restore();
        }
      }]
    });
  }

  function setActiveArticle(panelId) {
    [articleByBreed, articleByAge, articleByBehavior].forEach(function (p) {
      if (!p) return;
      p.classList.remove("active");
      if (p.id === panelId) p.classList.add("active");
    });
  }

  // ——— По породе ———
  function loadBreeds() {
    fetch(API + "/breeds")
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) return;
        breedsCache = res.items || [];
        renderBreedCards();
      })
      .catch(function () {});
  }

  function renderBreedCards() {
    if (!breedListView) return;
    breedListView.innerHTML = "";
    if (!breedsCache || !breedsCache.length) {
      breedListView.innerHTML = "<p style=\"color:#6b7280;\">Данные по породам пока отсутствуют.</p>";
      return;
    }
    breedsCache.forEach(function (item) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "breed-card";
      var imgConf = getBreedImageConfig(item);
      var title = escapeHtml(item.breed_name || "Порода");
      var cardCandidates = []
        .concat(buildAltExtCandidates(imgConf.card))
        .concat(buildAltExtCandidates(imgConf.hero));
      var imgPath = cardCandidates[0] || imgConf.card || "";
      card.innerHTML = "<img src=\"" + imgPath + "\" alt=\"" + title + "\" class=\"breed-card-img\">" +
        "<div class=\"breed-card-body\"><div class=\"breed-card-title\">" + title + "</div></div>";
      var imgEl = card.querySelector("img.breed-card-img");
      if (imgEl) setImgCandidates(imgEl, cardCandidates);
      card.addEventListener("click", function () {
        showBreedArticle(item.id);
      });
      breedListView.appendChild(card);
    });
    if (breedArticleView) breedArticleView.classList.remove("active");
  }

  function showBreedArticle(breedId) {
    if (!breedsCache || !breedsCache.length) return;
    var item = breedsCache.find(function (b) { return String(b.id) === String(breedId); });
    if (!item || !breedArticleView || !breedListView) return;

    // переключаем режим: список → статья
    breedArticleView.classList.add("active");
    breedListView.style.display = "none";

    var name = item.breed_name || "Порода";
    if (breedCurrentName) breedCurrentName.textContent = name;
    if (breedArticleTitle) breedArticleTitle.textContent = name;

    // Прокручиваем к верхней части статьи (навигатор + заголовок),
    // чтобы скролл не уезжал на середину картинки.
    if (breedBackToListBtn) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          var rect = breedBackToListBtn.getBoundingClientRect();
          var targetTop = rect.top + window.scrollY - 140; // небольшой запас вверх
          if (targetTop < 0) targetTop = 0;
          window.scrollTo({ top: targetTop, behavior: "smooth" });
        });
      });
    } else if (breedArticleTitle) {
      breedArticleTitle.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // основная картинка породы в статье:
    if (breedArticleMainImage) {
      var imgConf2 = getBreedImageConfig(item);
      breedArticleMainImage.alt = name;
      var heroCandidates = []
        .concat(buildAltExtCandidates(imgConf2.hero))
        .concat(buildAltExtCandidates(imgConf2.card));
      var heroPath = heroCandidates[0] || imgConf2.hero || imgConf2.card || "";
      breedArticleMainImage.src = heroPath;
      setImgCandidates(breedArticleMainImage, heroCandidates);
    }

    // вкладка «Описание»
    if (breedOverviewText) {
      var htmlO = "";
      if (item.description) {
        htmlO += formatArticleRichText(item.description);
      }
      breedOverviewText.innerHTML = htmlO || "<p>Описание пока не добавлено.</p>";
    }

    // вкладка «Забота о здоровье»
    if (breedHealthText) {
      var text = "";
      if (item.common_issues) {
        text += formatArticleRichText(item.common_issues);
      }
      breedHealthText.innerHTML = text || "<p>Информация по заботе о здоровье пока не добавлена.</p>";
    }
    if (breedHealthChartTitle) {
      breedHealthChartTitle.textContent = "Частота заболеваний у " + name;
    }
    var dv = item.disease_values || item.disease_frequency || {};
    var grouped = groupBySystems(dv);
    destroyChart(breedHealthChart);
    breedHealthChart = renderHorizontalBarChart("breedHealthChart", grouped.labels, grouped.values, "");
    setBreedChartSource();

    // вкладка «Особенности» (typical_diseases: массив из JSON или одна строка из Excel)
    if (breedProblemsText) {
      var htmlP = "";
      if (Array.isArray(item.typical_diseases) && item.typical_diseases.length) {
        htmlP +=
          '<ul class="article-rich-list">' +
          item.typical_diseases
            .map(function (disease) {
              return (
                '<li class="article-rich-li">' +
                formatInlineMultiline(disease) +
                "</li>"
              );
            })
            .join("") +
          "</ul>";
      } else if (item.typical_diseases) {
        htmlP += formatArticleRichText(String(item.typical_diseases));
      }
      breedProblemsText.innerHTML = htmlP || "<p>Особенности пока не добавлены.</p>";
    }

    // активируем первую вкладку
    document.querySelectorAll(".breed-tab").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === "overview");
    });
    document.querySelectorAll(".breed-section").forEach(function (sec) {
      sec.classList.toggle("active", sec.id === "breedSectionOverview");
    });
  }

  if (breedBackToListBtn && breedListView && breedArticleView) {
    breedBackToListBtn.addEventListener("click", function () {
      breedArticleView.classList.remove("active");
      breedListView.style.display = "grid";
      destroyChart(breedHealthChart);
      clearBreedChartSource();
    });
  }

  document.querySelectorAll(".breed-tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tab = btn.getAttribute("data-tab");
      document.querySelectorAll(".breed-tab").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      document.querySelectorAll(".breed-section").forEach(function (sec) {
        sec.classList.toggle("active",
          (tab === "overview" && sec.id === "breedSectionOverview") ||
          (tab === "health" && sec.id === "breedSectionHealth") ||
          (tab === "problems" && sec.id === "breedSectionProblems")
        );
      });
    });
  });

  if (articlesByBreedBtn) {
    articlesByBreedBtn.addEventListener("click", function () {
      setActiveArticle("articleByBreed");
      if (!breedsCache) loadBreeds();
      else {
        renderBreedCards();
        if (breedListView) {
          breedListView.style.display = "grid";
        }
      }
    });
  }

  // ——— По возрасту ———
  function loadAges() {
    fetch(API + "/ages")
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) return;
        agesCache = res.items || [];
        renderAgeCards();
      })
      .catch(function () {});
  }

  function renderAgeCards() {
    if (!ageListView) return;
    ageListView.innerHTML = "";
    if (!agesCache || !agesCache.length) {
      ageListView.innerHTML = "<p style=\"color:#6b7280;\">Данные по возрастам пока отсутствуют.</p>";
      return;
    }
    agesCache.forEach(function (item) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "age-card";
      var imgConf = getAgeImageConfig(item);
      var candidates = []
        .concat(buildAltExtCandidates(imgConf.card))
        .concat(buildAltExtCandidates(imgConf.hero));
      var imgPath = candidates[0] || "";
      var title = escapeHtml(item.age_group || "Возраст");
      card.innerHTML =
        "<img src=\"" + imgPath + "\" alt=\"" + title + "\" class=\"age-card-img\">" +
        "<div class=\"age-card-body\"><div class=\"age-card-title\">" + title + "</div></div>";
      var imgEl = card.querySelector("img.age-card-img");
      if (imgEl) {
        setImgCandidates(imgEl, candidates);
      }
      card.addEventListener("click", function () {
        showAgeArticle(item.id);
      });
      ageListView.appendChild(card);
    });
    if (ageArticleView) ageArticleView.classList.remove("active");
  }

  function showAgeArticle(ageId) {
    if (!agesCache || !agesCache.length) return;
    var item = agesCache.find(function (a) { return String(a.id) === String(ageId); });
    if (!item || !ageArticleView || !ageListView) return;

    ageArticleView.classList.add("active");
    ageListView.style.display = "none";

    var name = item.age_group || "Возраст";
    if (ageCurrentName) ageCurrentName.textContent = name;
    if (ageArticleTitle) ageArticleTitle.textContent = name;

    if (ageArticleMainImage) {
      var imgConf2 = getAgeImageConfig(item);
      ageArticleMainImage.alt = name;
      var candidates2 = []
        .concat(buildAltExtCandidates(imgConf2.hero))
        .concat(buildAltExtCandidates(imgConf2.card));
      setImgCandidates(ageArticleMainImage, candidates2);
    }

    if (ageOverviewText) {
      var htmlO = "";
      if (item.description) {
        htmlO += formatArticleRichText(item.description);
      }
      ageOverviewText.innerHTML = htmlO || "<p>Описание пока не добавлено.</p>";
    }

    if (ageHealthText) {
      var text = "";
      if (item.care_recommendations) {
        text += formatArticleRichText(item.care_recommendations);
      }
      ageHealthText.innerHTML = text || "<p>Рекомендации по уходу пока не добавлены.</p>";
    }
    if (ageHealthChartTitle) {
      ageHealthChartTitle.textContent = "Частота заболеваний в возрасте " + name;
    }
    var dv = item.disease_values || item.complications_frequency || {};
    var grouped = groupBySystems(dv);
    destroyChart(ageHealthChart);
    ageHealthChart = renderHorizontalBarChart("ageHealthChart", grouped.labels, grouped.values, "");
    setAgeChartSource();

    if (ageProblemsText) {
      var htmlP = "";
      if (item.common_problems) {
        htmlP += formatArticleRichText(item.common_problems);
      }
      ageProblemsText.innerHTML = htmlP || "<p>Частые проблемы пока не добавлены.</p>";
    }

    document.querySelectorAll(".age-tab").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-age-tab") === "overview");
    });
    document.querySelectorAll(".age-section").forEach(function (sec) {
      sec.classList.toggle("active", sec.id === "ageSectionOverview");
    });
  }

  if (ageBackToListBtn && ageListView && ageArticleView) {
    ageBackToListBtn.addEventListener("click", function () {
      ageArticleView.classList.remove("active");
      ageListView.style.display = "grid";
      destroyChart(ageHealthChart);
      clearAgeChartSource();
    });
  }

  document.querySelectorAll(".age-tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tab = btn.getAttribute("data-age-tab");
      document.querySelectorAll(".age-tab").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      document.querySelectorAll(".age-section").forEach(function (sec) {
        sec.classList.toggle("active",
          (tab === "overview" && sec.id === "ageSectionOverview") ||
          (tab === "health" && sec.id === "ageSectionHealth") ||
          (tab === "problems" && sec.id === "ageSectionProblems")
        );
      });
    });
  });

  if (articlesByAgeBtn) {
    articlesByAgeBtn.addEventListener("click", function () {
      setActiveArticle("articleByAge");
      if (!agesCache) loadAges();
      else {
        renderAgeCards();
        if (ageListView) ageListView.style.display = "grid";
      }
    });
  }

  function roundBehaviorFrequency(v) {
    var n = Number(v);
    if (isNaN(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  function renderBehaviorFrequencyChart() {
    if (!behaviorsCache || !behaviorsCache.length) return;
    if (behaviorFrequencyTitle) {
      behaviorFrequencyTitle.textContent = "Частота встречаемости поведенческих проблем";
    }
    var labels = behaviorsCache.map(function (b) { return b.behavior_type; });
    var values = behaviorsCache.map(function (b) { return roundBehaviorFrequency(b.frequency || 0); });
    destroyChart(behaviorFrequencyChart);
    behaviorFrequencyChart = renderHorizontalBarChart("behaviorFrequencyChart", labels, values, "");
    setBehaviorChartSource();
  }

  var behaviorCarouselPage = 0;

  function getBehaviorCardsPerPage() {
    if (window.innerWidth <= 640) return 1;
    if (window.innerWidth <= 900) return 2;
    return 3;
  }

  function updateBehaviorArrowState() {
    if (!behaviorsCache) return;
    var behaviorCardsPerPage = getBehaviorCardsPerPage();
    var pages = Math.max(1, Math.ceil(behaviorsCache.length / behaviorCardsPerPage));
    if (behaviorScrollPrev) {
      behaviorScrollPrev.style.visibility = behaviorCarouselPage > 0 ? "visible" : "hidden";
    }
    if (behaviorScrollNext) {
      behaviorScrollNext.style.visibility = behaviorCarouselPage < pages - 1 ? "visible" : "hidden";
    }
  }

  function renderBehaviorCards() {
    if (!behaviorCarouselTrack) return;
    behaviorCarouselTrack.innerHTML = "";
    if (!behaviorsCache || !behaviorsCache.length) {
      behaviorCarouselTrack.innerHTML = "<p style=\"color:#6b7280;\">Данные по поведению пока отсутствуют.</p>";
      updateBehaviorArrowState();
      return;
    }
    behaviorsCache.forEach(function (item) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "behavior-card";
      var imgConf = getBehaviorImageConfig(item);
      var candidates = []
        .concat(buildAltExtCandidates(imgConf.card))
        .concat(buildAltExtCandidates(imgConf.hero));
      var imgPath = candidates[0] || "";
      var title = escapeHtml(item.behavior_type || "Проблема поведения");
      card.innerHTML =
        "<img src=\"" + imgPath + "\" alt=\"" + title + "\" class=\"behavior-card-img\">" +
        "<div class=\"behavior-card-body\"><div class=\"behavior-card-title\">" + title + "</div></div>";
      var imgEl = card.querySelector("img.behavior-card-img");
      if (imgEl) setImgCandidates(imgEl, candidates);
      card.addEventListener("click", function () {
        showBehaviorArticle(item.id);
      });
      behaviorCarouselTrack.appendChild(card);
    });
    behaviorCarouselPage = 0;
    behaviorCarouselTrack.style.transform = "translateX(0)";
    updateBehaviorArrowState();
  }

  function showBehaviorPage(delta) {
    if (!behaviorCarouselTrack || !behaviorsCache || !behaviorsCache.length) return;
    var viewport = behaviorCarouselTrack.parentElement;
    if (!viewport) return;
    var behaviorCardsPerPage = getBehaviorCardsPerPage();
    var pages = Math.max(1, Math.ceil(behaviorsCache.length / behaviorCardsPerPage));
    behaviorCarouselPage += delta;
    if (behaviorCarouselPage < 0) behaviorCarouselPage = 0;
    if (behaviorCarouselPage > pages - 1) behaviorCarouselPage = pages - 1;
    var gapPx = 20;
    var pageWidth = viewport.clientWidth + gapPx;
    var translatePx = -(behaviorCarouselPage * pageWidth);
    behaviorCarouselTrack.style.transform = "translateX(" + translatePx + "px)";
    updateBehaviorArrowState();
  }

  // ——— По поведению ———
  function loadBehaviors() {
    fetch(API + "/behaviors")
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) return;
        var rawItems = res.items || [];
        var byCanonical = {};
        rawItems.forEach(function (item) {
          var canonical = resolveBehaviorCanonicalName(item.behavior_type);
          if (!canonical || byCanonical[canonical]) return;
          byCanonical[canonical] = Object.assign({}, item, { behavior_type: canonical });
        });
        behaviorsCache = BEHAVIOR_ORDER
          .map(function (name) { return byCanonical[name]; })
          .filter(Boolean);
        renderBehaviorCards();
        renderBehaviorFrequencyChart();
      })
      .catch(function () {});
  }

  function showBehaviorArticle(behaviorId) {
    if (!behaviorsCache || !behaviorsCache.length) return;
    var item = behaviorsCache.find(function (b) { return String(b.id) === String(behaviorId); });
    if (!item || !behaviorListView || !behaviorArticleView) return;

    behaviorListView.style.display = "none";
    behaviorArticleView.classList.add("active");

    var name = item.behavior_type || "Проблема поведения";
    if (behaviorCurrentName) behaviorCurrentName.textContent = name;
    if (behaviorArticleTitle) behaviorArticleTitle.textContent = name;

    if (behaviorArticleMainImage) {
      var imgConf2 = getBehaviorImageConfig(item);
      behaviorArticleMainImage.alt = name;
      var candidates2 = []
        .concat(buildAltExtCandidates(imgConf2.hero))
        .concat(buildAltExtCandidates(imgConf2.card));
      setImgCandidates(behaviorArticleMainImage, candidates2);
    }

    if (behaviorArticleText) {
      var html = "";
      if (item.description) {
        html += "<section class=\"behavior-section\"><h4>Описание проблемы</h4>" + formatArticleRichText(item.description) + "</section>";
      }
      if (item.causes) {
        html += "<section class=\"behavior-section\"><h4>Причины</h4>" + formatArticleRichText(item.causes) + "</section>";
      }
      if (item.solutions) {
        html += "<section class=\"behavior-section\"><h4>Решения</h4>" + formatArticleRichText(item.solutions) + "</section>";
      }
      behaviorArticleText.innerHTML = html || "<p>Данные по этой проблеме пока отсутствуют.</p>";
    }
  }

  if (behaviorScrollPrev) {
    behaviorScrollPrev.addEventListener("click", function () { showBehaviorPage(-1); });
  }
  if (behaviorScrollNext) {
    behaviorScrollNext.addEventListener("click", function () { showBehaviorPage(1); });
  }
  if (behaviorBackToListBtn && behaviorListView && behaviorArticleView) {
    behaviorBackToListBtn.addEventListener("click", function () {
      behaviorArticleView.classList.remove("active");
      behaviorListView.style.display = "block";
    });
  }
  window.addEventListener("resize", function () {
    if (!behaviorsCache || !behaviorsCache.length || !behaviorCarouselTrack) return;
    var viewport = behaviorCarouselTrack.parentElement;
    if (!viewport) return;
    var behaviorCardsPerPage = getBehaviorCardsPerPage();
    var pages = Math.max(1, Math.ceil(behaviorsCache.length / behaviorCardsPerPage));
    if (behaviorCarouselPage > pages - 1) behaviorCarouselPage = pages - 1;
    var gapPx = 20;
    var pageWidth = viewport.clientWidth + gapPx;
    var translatePx = -(behaviorCarouselPage * pageWidth);
    behaviorCarouselTrack.style.transform = "translateX(" + translatePx + "px)";
    updateBehaviorArrowState();
  });

  if (articlesByBehaviorBtn) {
    articlesByBehaviorBtn.addEventListener("click", function () {
      setActiveArticle("articleByBehavior");
      if (!behaviorsCache) loadBehaviors();
      else {
        renderBehaviorCards();
        renderBehaviorFrequencyChart();
      }
      if (behaviorArticleView) behaviorArticleView.classList.remove("active");
      if (behaviorListView) behaviorListView.style.display = "block";
    });
  }
})();
