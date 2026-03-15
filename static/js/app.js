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
    if (!getToken()) {
      var authModalEl = document.getElementById("authModal");
      var loginTabEl = document.getElementById("loginTab");
      var registerTabEl = document.getElementById("registerTab");
      if (authModalEl) {
        authModalEl.classList.add("open");
        if (loginTabEl && registerTabEl) {
          loginTabEl.style.display = "none";
          registerTabEl.style.display = "block";
          var tabButtons = document.querySelectorAll(".modal-tabs button");
          tabButtons.forEach(function (b) { b.classList.remove("active"); });
          tabButtons.forEach(function (b) {
            if (b.getAttribute("data-tab") === "register") b.classList.add("active");
          });
        }
      }
      return;
    }
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

  var breedSelect = document.getElementById("breedSelect");
  var breedArticleText = document.getElementById("breedArticleText");
  var breedDiseaseTitle = document.getElementById("breedDiseaseTitle");

  var ageSelect = document.getElementById("ageSelect");
  var ageArticleText = document.getElementById("ageArticleText");
  var ageComplicationsTitle = document.getElementById("ageComplicationsTitle");

  var behaviorSelect = document.getElementById("behaviorSelect");
  var behaviorArticleText = document.getElementById("behaviorArticleText");
  var behaviorFrequencyTitle = document.getElementById("behaviorFrequencyTitle");

  var chartSourcesTexts = document.querySelectorAll(".chart-sources-text");
  var chartSources = [
    "Dog Aging Project / Texas A&M University",
    "RVC VetCompass Programme",
    "Университет Падуи",
    "Шведское исследование поведения собак (BPH)",
    "Исследование лейшманиоза",
    "Шведское исследование Nova Scotia Duck Tolling Retriever"
  ];
  var chartSourcesIndex = 0;

  function rotateChartSources() {
    if (!chartSourcesTexts || !chartSourcesTexts.length || !chartSources.length) return;
    chartSourcesIndex = (chartSourcesIndex + 1) % chartSources.length;
    var text = chartSources[chartSourcesIndex];
    chartSourcesTexts.forEach(function (el) {
      el.textContent = text;
    });
  }

  if (chartSourcesTexts && chartSourcesTexts.length && chartSources.length) {
    chartSourcesTexts.forEach(function (el) { el.textContent = chartSources[0]; });
    setInterval(rotateChartSources, 2000);
  }

  var breedsCache = null;
  var agesCache = null;
  var behaviorsCache = null;

  var breedDiseaseChart = null;
  var breedTraitChart = null;
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

    // Цвета: для "особенностей породы" и графика по поведению — голубые оттенки,
    // для остальных графиков — зелёный/жёлтый/красный по проценту.
    var colors;
    if (canvasId.indexOf("Trait") !== -1 || canvasId === "behaviorFrequencyChart") {
      var bluePalette = [
        "rgba(59, 130, 246, 0.45)",
        "rgba(96, 165, 250, 0.45)",
        "rgba(129, 199, 255, 0.45)",
        "rgba(191, 219, 254, 0.5)"
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
              display: false
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
          var labelFontSizes = [16, 14, 12, 10, 8];
          var baseFont = "600 16px " + fontFamilyStr;
          var minSize = 8;

          function fitLabelText(text, maxWidth, fontSize) {
            ctx.font = "600 " + fontSize + "px " + fontFamilyStr;
            if (!text) return "";
            var measured = ctx.measureText(text).width;
            if (measured <= maxWidth) return text;
            var ellipsis = "…";
            var ellipsisWidth = ctx.measureText(ellipsis).width;
            var available = maxWidth - ellipsisWidth;
            if (available <= 0) return ellipsis;
            var result = "";
            for (var i = 0; i < text.length; i++) {
              var next = result + text[i];
              if (ctx.measureText(next).width > available) break;
              result = next;
            }
            return result + ellipsis;
          }

          function getLabelFontSize(text, maxWidth) {
            for (var s = 0; s < labelFontSizes.length; s++) {
              var size = labelFontSizes[s];
              ctx.font = "600 " + size + "px " + fontFamilyStr;
              if (ctx.measureText(text).width <= maxWidth) return size;
            }
            return null;
          }

          function drawBubble(bar, label) {
            var bubbleFontSize = 11;
            var padH = 10;
            var padV = 6;
            ctx.font = "600 " + bubbleFontSize + "px " + fontFamilyStr;
            var tw = ctx.measureText(label).width;
            var bubbleW = tw + padH * 2;
            var bubbleH = bubbleFontSize + padV * 2;
            var tailInset = 10;
            var bubbleLeft = bar.x + tailInset;
            var bubbleTop = bar.y - bubbleH / 2;
            var r = bubbleH / 2;
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "rgba(107, 114, 128, 0.55)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            var left = bubbleLeft;
            var right = bubbleLeft + bubbleW;
            var top = bubbleTop;
            var bottom = bubbleTop + bubbleH;
            var tipX = bar.x + 3;
            var tipY = bar.y;
            ctx.moveTo(left + r, top);
            ctx.lineTo(right - r, top);
            ctx.quadraticCurveTo(right, top, right, top + r);
            ctx.lineTo(right, bottom - r);
            ctx.quadraticCurveTo(right, bottom, right - r, bottom);
            ctx.lineTo(left + r, bottom);
            ctx.quadraticCurveTo(left, bottom, left, bottom - r);
            ctx.lineTo(left, tipY + 5);
            ctx.lineTo(tipX, tipY);
            ctx.lineTo(left, tipY - 5);
            ctx.lineTo(left, top + r);
            ctx.quadraticCurveTo(left, top, left + r, top);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#6b7280";
            ctx.font = "600 " + bubbleFontSize + "px " + fontFamilyStr;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(label, bubbleLeft + padH, bar.y);
            ctx.textBaseline = "alphabetic";
          }

          meta.data.forEach(function (bar, index) {
            var label = chart.data.labels[index];
            if (!label) return;
            var value = dataset.data[index];
            var y = bar.y + 6;
            ctx.font = baseFont;
            if (typeof value === "number") {
              ctx.textAlign = "right";
              ctx.fillText(Math.round(value) + "%", bar.x - 8, y);
            }
            var rightText = (typeof value === "number") ? Math.round(value) + "%" : "";
            var rightWidth = rightText ? ctx.measureText(rightText).width + 16 : 0;
            var maxLabelWidth = Math.max(0, bar.x - rightWidth - (bar.base + 12));
            var labelSize = getLabelFontSize(label, maxLabelWidth);
            if (labelSize !== null) {
              ctx.font = "600 " + labelSize + "px " + fontFamilyStr;
              var fitted = fitLabelText(label, maxLabelWidth, labelSize);
              ctx.textAlign = "left";
              ctx.fillText(fitted, bar.base + 8, y);
            } else {
              drawBubble(bar, label);
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
        if (breedSelect) {
          breedSelect.innerHTML = "<option value=\"\">Выбрать породу</option>" +
            breedsCache.map(function (b) {
              return "<option value=\"" + String(b.id) + "\">" + escapeHtml(b.breed_name) + "</option>";
            }).join("");
        }
      })
      .catch(function () {});
  }

  function showBreedArticle(breedId) {
    if (!breedsCache || !breedsCache.length) return;
    var item = breedsCache.find(function (b) { return String(b.id) === String(breedId); });
    if (!item) return;
    if (breedArticleText) {
      var html = "";
      if (item.description) {
        html += "<h4>Описание породы</h4><p>" + escapeHtml(item.description) + "</p>";
      }
      if (item.common_issues) {
        html += "<h4>Частые проблемы</h4><p>" + escapeHtml(item.common_issues) + "</p>";
      }
      if (item.typical_diseases && item.typical_diseases.length) {
        html += "<h4>Типичные заболевания</h4><ul>" +
          item.typical_diseases.map(function (d) { return "<li>" + escapeHtml(String(d)) + "</li>"; }).join("") +
          "</ul>";
      }
      breedArticleText.classList.remove("show");
      breedArticleText.innerHTML = html || "<p>Данные по породе пока отсутствуют.</p>";
      // небольшая задержка, чтобы сработала анимация появления
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          breedArticleText.classList.add("show");
        });
      });
    }
    // сразу после текста рисуем графики
    if (breedDiseaseTitle) {
      breedDiseaseTitle.textContent = "Частота заболеваний у " + item.breed_name;
    }
    var diseaseLabels = [];
    var diseaseValues = [];
    var df = item.disease_frequency || {};
    Object.keys(df).forEach(function (k) {
      diseaseLabels.push(k);
      diseaseValues.push(df[k]);
    });
    destroyChart(breedDiseaseChart);
    breedDiseaseChart = renderHorizontalBarChart("breedDiseaseChart", diseaseLabels, diseaseValues, "");

    var traitLabels = [];
    var traitValues = [];
    var tf = item.trait_frequency || {};
    Object.keys(tf).forEach(function (k) {
      traitLabels.push(k);
      traitValues.push(tf[k]);
    });
    destroyChart(breedTraitChart);
    breedTraitChart = renderHorizontalBarChart("breedTraitChart", traitLabels, traitValues, "");
  }

  if (breedSelect) {
    breedSelect.addEventListener("change", function () {
      var id = breedSelect.value;
      if (id) {
        showBreedArticle(id);
      } else {
        // сбрасываем текст и графики
        if (breedArticleText) {
          breedArticleText.classList.remove("show");
          breedArticleText.innerHTML = "";
        }
        destroyChart(breedDiseaseChart);
        destroyChart(breedTraitChart);
      }
    });
  }

  if (articlesByBreedBtn) {
    articlesByBreedBtn.addEventListener("click", function () {
      setActiveArticle("articleByBreed");
      if (!breedsCache) loadBreeds();
    });
  }

  // ——— По возрасту ———
  function loadAges() {
    fetch(API + "/ages")
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) return;
        agesCache = res.items || [];
        if (ageSelect) {
          ageSelect.innerHTML = "<option value=\"\">Выбрать возраст</option>" +
            agesCache.map(function (a) {
              return "<option value=\"" + String(a.id) + "\">" + escapeHtml(a.age_group) + "</option>";
            }).join("");
        }
      })
      .catch(function () {});
  }

  function showAgeArticle(ageId) {
    if (!agesCache || !agesCache.length) return;
    var item = agesCache.find(function (a) { return String(a.id) === String(ageId); });
    if (!item) return;
    if (ageArticleText) {
      var html = "";
      if (item.description) html += "<h4>Описание</h4><p>" + escapeHtml(item.description) + "</p>";
      if (item.care_recommendations) html += "<h4>Рекомендации по уходу</h4><p>" + escapeHtml(item.care_recommendations) + "</p>";
      if (item.common_problems) html += "<h4>Частые проблемы</h4><p>" + escapeHtml(item.common_problems) + "</p>";
      ageArticleText.classList.remove("show");
      ageArticleText.innerHTML = html || "<p>Данные по возрастной группе пока отсутствуют.</p>";
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          ageArticleText.classList.add("show");
        });
      });
    }
    if (ageComplicationsTitle) {
      ageComplicationsTitle.textContent = "Осложнения в возрасте " + item.age_group;
    }
    var compLabels = [];
    var compValues = [];
    var cf = item.complications_frequency || {};
    Object.keys(cf).forEach(function (k) {
      compLabels.push(k);
      compValues.push(cf[k]);
    });
    destroyChart(ageComplicationsChart);
    ageComplicationsChart = renderHorizontalBarChart("ageComplicationsChart", compLabels, compValues, "");

    var careLabels = [];
    var careValues = [];
    var dc = item.diseases_by_care || {};
    Object.keys(dc).forEach(function (k) {
      careLabels.push(k);
      careValues.push(dc[k]);
    });
    destroyChart(ageCareChart);
    ageCareChart = renderHorizontalBarChart("ageCareChart", careLabels, careValues, "");
  }

  if (ageSelect) {
    ageSelect.addEventListener("change", function () {
      var id = ageSelect.value;
      if (id) {
        showAgeArticle(id);
      } else {
        if (ageArticleText) {
          ageArticleText.classList.remove("show");
          ageArticleText.innerHTML = "";
        }
        destroyChart(ageComplicationsChart);
        destroyChart(ageCareChart);
      }
    });
  }

  if (articlesByAgeBtn) {
    articlesByAgeBtn.addEventListener("click", function () {
      setActiveArticle("articleByAge");
      if (!agesCache) loadAges();
    });
  }

  // ——— По поведению ———
  function loadBehaviors() {
    fetch(API + "/behaviors")
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) return;
        behaviorsCache = res.items || [];
        if (behaviorSelect) {
          behaviorSelect.innerHTML = "<option value=\"\">Выбрать проблему</option>" +
            behaviorsCache.map(function (b) {
              return "<option value=\"" + String(b.id) + "\">" + escapeHtml(b.behavior_type) + "</option>";
            }).join("");
        }
      })
      .catch(function () {});
  }

  function showBehaviorArticle(behaviorId) {
    if (!behaviorsCache || !behaviorsCache.length) return;
    var item = behaviorsCache.find(function (b) { return String(b.id) === String(behaviorId); });
    if (!item) return;
    if (behaviorArticleText) {
      var html = "";
      if (item.description) html += "<h4>Описание проблемы</h4><p>" + escapeHtml(item.description) + "</p>";
      if (item.causes) html += "<h4>Причины</h4><p>" + escapeHtml(item.causes) + "</p>";
      if (item.solutions) html += "<h4>Решения</h4><p>" + escapeHtml(item.solutions) + "</p>";
      behaviorArticleText.classList.remove("show");
      behaviorArticleText.innerHTML = html || "<p>Данные по этой проблеме пока отсутствуют.</p>";
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          behaviorArticleText.classList.add("show");
        });
      });
    }
    if (behaviorsCache && behaviorsCache.length) {
      if (behaviorFrequencyTitle) {
        behaviorFrequencyTitle.textContent = "Частота встречаемости поведенческих проблем";
      }
      var labels = behaviorsCache.map(function (b) { return b.behavior_type; });
      var values = behaviorsCache.map(function (b) { return b.frequency || 0; });
      destroyChart(behaviorFrequencyChart);
      behaviorFrequencyChart = renderHorizontalBarChart(
        "behaviorFrequencyChart",
        labels,
        values,
        ""
      );
    }
  }

  if (behaviorSelect) {
    behaviorSelect.addEventListener("change", function () {
      var id = behaviorSelect.value;
      if (id) {
        showBehaviorArticle(id);
      } else {
        if (behaviorArticleText) {
          behaviorArticleText.classList.remove("show");
          behaviorArticleText.innerHTML = "";
        }
        destroyChart(behaviorFrequencyChart);
      }
    });
  }

  if (articlesByBehaviorBtn) {
    articlesByBehaviorBtn.addEventListener("click", function () {
      setActiveArticle("articleByBehavior");
      if (!behaviorsCache) loadBehaviors();
    });
  }
})();
