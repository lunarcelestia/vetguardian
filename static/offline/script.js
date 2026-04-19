/**
 * Общая логика офлайн-модуля: баннер установки, IndexedDB, регистрация SW.
 * Страница определяется через document.body.dataset.page: home | handbook | quicktest
 */
(function () {
  "use strict";

  var CACHE_NAME = "vetguardian-offline-v1";
  var LS_READY = "vg_offline_bundle_ready";
  var SS_POSTPONE = "vg_offline_postpone_session";
  var IDB_NAME = "vetguardian-offline";
  var IDB_STORE = "bundleMeta";
  var IDB_VERSION = 1;

  /** Те же файлы, что в sw.js (дублируем для ручного кеширования + IDB метаданных). */
  var OFFLINE_ASSETS = [
    "/offline/index.html",
    "/offline/handbook.html",
    "/offline/quicktest.html",
    "/offline/styles.css",
    "/offline/script.js",
    "/offline/manifest.json",
    "/offline/icon-192.png",
    "/offline/icon-512.png",
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function isOnline() {
    return navigator.onLine;
  }

  function isBundleMarkedReady() {
    try {
      return localStorage.getItem(LS_READY) === "1";
    } catch (e) {
      return false;
    }
  }

  function showEl(el, show) {
    if (!el) return;
    el.hidden = !show;
  }

  /** Сохраняем метаданные в IndexedDB (доп. надёжность на iOS рядом с Cache API). */
  function saveBundleMetaToIDB() {
    return new Promise(function (resolve, reject) {
      if (!("indexedDB" in window)) {
        resolve(false);
        return;
      }
      var req;
      try {
        req = indexedDB.open(IDB_NAME, IDB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "key" });
        }
      };
      req.onerror = function () {
        reject(req.error);
      };
      req.onsuccess = function () {
        var db = req.result;
        try {
          var tx = db.transaction(IDB_STORE, "readwrite");
          tx.objectStore(IDB_STORE).put({
            key: "offline-v1",
            cacheName: CACHE_NAME,
            urls: OFFLINE_ASSETS,
            savedAt: Date.now(),
          });
          tx.oncomplete = function () {
            db.close();
            resolve(true);
          };
          tx.onerror = function () {
            db.close();
            reject(tx.error);
          };
        } catch (e) {
          db.close();
          reject(e);
        }
      };
    });
  }

  /** Ручное заполнение Cache API (дублирует precache SW — на случай если SW ещё не активен). */
  function precacheWithCacheAPI() {
    if (!("caches" in window)) {
      return Promise.reject(new Error("Cache API не поддерживается в этом браузере."));
    }
    return caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(OFFLINE_ASSETS);
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return Promise.resolve(null);
    }
    return navigator.serviceWorker
      .register("/offline/sw.js", { scope: "/offline/" })
      .then(function (reg) {
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        return reg;
      });
  }

  function waitForControllerIfNeeded() {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      if (!("serviceWorker" in navigator)) {
        resolve();
        return;
      }
      var done = false;
      function finish() {
        if (!done) {
          done = true;
          resolve();
        }
      }
      navigator.serviceWorker.addEventListener("controllerchange", finish, { once: true });
      setTimeout(finish, 4000);
    });
  }

  /**
   * Полная установка офлайн-пакета.
   * Сначала Cache API, затем SW, затем IndexedDB (если возможно).
   */
  function installOfflineBundle() {
    var banner = $("install-banner");
    var statusOk = $("install-status-ok");
    var statusErr = $("install-status-err");

    showEl(statusOk, false);
    showEl(statusErr, false);

    return precacheWithCacheAPI()
      .then(function () {
        return registerServiceWorker();
      })
      .then(function () {
        return waitForControllerIfNeeded();
      })
      .then(function () {
        return saveBundleMetaToIDB().catch(function (e) {
          console.warn("[offline] IDB meta failed", e);
          return false;
        });
      })
      .then(function (idbOk) {
        try {
          localStorage.setItem(LS_READY, "1");
        } catch (e) {}
        showEl(banner, false);
        showEl(statusOk, true);
        if (statusOk) {
          var base =
            "Офлайн-режим активирован! Теперь сайт будет работать даже без интернета.";
          if (!("indexedDB" in window)) {
            base +=
              " IndexedDB недоступен — используется стандартное кеширование браузера (Cache API).";
          } else if (idbOk === false) {
            base +=
              " Не удалось записать служебные данные в IndexedDB — офлайн опирается на кеш. На iOS рекомендуем «Добавить на экран домой».";
          }
          statusOk.textContent = base;
        }
      })
      .catch(function (err) {
        console.error("[offline] install failed", err);
        var msg =
          (err && err.message) ||
          "Не удалось сохранить файлы. Попробуйте другой браузер или проверьте HTTPS.";
        msg +=
          " Если ошибка повторяется, откройте сайт онлайн и дайте браузеру сохранить страницу в кеш (обычно это происходит после одного полного просмотра).";
        showEl(statusErr, true);
        if (statusErr) statusErr.textContent = msg;
      });
  }

  function setupInstallBanner() {
    var banner = $("install-banner");
    var btnYes = $("install-btn-yes");
    var btnNo = $("install-btn-no");
    var blocked = $("offline-blocked-msg");

    if (!banner) return;

    if (!isOnline() && !isBundleMarkedReady()) {
      showEl(blocked, true);
      showEl(banner, false);
      return;
    }

    if (isBundleMarkedReady()) {
      showEl(banner, false);
      showEl(blocked, false);
      return;
    }

    try {
      if (sessionStorage.getItem(SS_POSTPONE) === "1") {
        showEl(banner, false);
        return;
      }
    } catch (e) {}

    if (isOnline()) {
      showEl(banner, true);
    }

    if (btnYes) {
      btnYes.addEventListener("click", function () {
        installOfflineBundle();
      });
    }
    if (btnNo) {
      btnNo.addEventListener("click", function () {
        showEl(banner, false);
        try {
          sessionStorage.setItem(SS_POSTPONE, "1");
        } catch (e) {}
      });
    }
  }

  /** --- Быстрый тест (quicktest.html) --- */
  var QT_QUESTIONS = [
    {
      id: "breathe",
      text: "Питомец дышит?",
      options: [
        { label: "Да", value: "yes" },
        { label: "Нет", value: "no" },
        { label: "Затруднённо", value: "hard" },
      ],
    },
    {
      id: "bleed",
      text: "Есть сильное кровотечение?",
      options: [
        { label: "Да", value: "yes" },
        { label: "Нет", value: "no" },
      ],
    },
    {
      id: "conscious",
      text: "Питомец в сознании (реагирует на голос, дергается)?",
      options: [
        { label: "Да", value: "yes" },
        { label: "Нет", value: "no" },
      ],
    },
    {
      id: "seizure",
      text: "Были судороги сейчас или в последние минуты?",
      options: [
        { label: "Да", value: "yes" },
        { label: "Нет", value: "no" },
      ],
    },
    {
      id: "poisonHeat",
      text: "Есть подозрение на отравление или сильный перегрев?",
      options: [
        { label: "Да", value: "yes" },
        { label: "Нет", value: "no" },
        { label: "Не знаю", value: "unknown" },
      ],
    },
  ];

  function evaluateQuickTest(answers) {
    var level = "green";
    /** Приоритет раздела справочника при нескольких красных признаках */
    var anchor = "bleeding";
    var lines = [];

    function bumpToYellow() {
      if (level === "green") level = "yellow";
    }
    function bumpToRed(newAnchor, msg) {
      if (level !== "red") {
        anchor = newAnchor;
      }
      level = "red";
      lines.push(msg);
    }

    if (answers.breathe === "no") {
      bumpToRed(
        "breathing",
        "Нет дыхания — экстренная ситуация. Немедленно в клинику, по дороге позвоните врачу."
      );
    } else if (answers.breathe === "hard") {
      bumpToYellow();
      lines.push("Затруднённое дыхание — нужна срочная ветеринарная оценка.");
      anchor = "breathing";
    }

    if (answers.bleed === "yes") {
      bumpToRed("bleeding", "Сильное кровотечение — наложите давящую повязку, поднимите конечность при возможности, в клинику.");
    }

    if (answers.conscious === "no") {
      bumpToRed("breathing", "Нет сознания — срочно в клинику. Держите голову в нейтрали, следите за дыханием.");
    }

    if (answers.seizure === "yes") {
      bumpToRed("seizures", "Судороги — уберите опасные предметы, не кладите предметы в пасть, после приступа — в клинику.");
    }

    if (answers.poisonHeat === "yes") {
      if (level === "green") level = "yellow";
      lines.push(
        "Подозрение на отравление или перегрев — не вызывайте рвоту без указания врача, сохраните упаковку/образец, в клинику."
      );
      if (level !== "red") anchor = "poisoning";
    } else if (answers.poisonHeat === "unknown") {
      bumpToYellow();
      lines.push("Если сомневаетесь — лучше перестраховаться и проконсультироваться с ветеринаром.");
      if (level !== "red") anchor = "heatstroke";
    }

    if (lines.length === 0) {
      lines.push("Критических ответов по чек-листу не выявлено.");
      lines.push("При любом ухудшении — обратитесь к ветеринару.");
      anchor = "heatstroke";
    }

    var title =
      level === "red"
        ? "КРАСНЫЙ уровень"
        : level === "yellow"
          ? "ЖЁЛТЫЙ уровень"
          : "ЗЕЛЁНЫЙ уровень";

    return { level: level, title: title, lines: lines, handbookAnchor: anchor };
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setupQuickTest() {
    var root = $("qt-root");
    if (!root) return;

    var idx = 0;
    var answers = {};
    var progressEl = $("qt-progress");
    var questionEl = $("qt-question");
    var optionsEl = $("qt-options");
    var resultEl = $("qt-result");
    var levelBadge = $("qt-level-badge");
    var textEl = $("qt-result-text");
    var linkEl = $("qt-handbook-link");

    function renderStep() {
      var q = QT_QUESTIONS[idx];
      if (!q) return;
      if (progressEl) {
        progressEl.textContent = "Вопрос " + (idx + 1) + " из " + QT_QUESTIONS.length;
      }
      if (questionEl) questionEl.textContent = q.text;
      if (optionsEl) {
        optionsEl.innerHTML = "";
        q.options.forEach(function (opt) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "qt-opt";
          btn.textContent = opt.label;
          btn.addEventListener("click", function () {
            answers[q.id] = opt.value;
            idx += 1;
            if (idx < QT_QUESTIONS.length) {
              renderStep();
            } else {
              showResult();
            }
          });
          optionsEl.appendChild(btn);
        });
      }
    }

    function showResult() {
      var res = evaluateQuickTest(answers);
      if (optionsEl) optionsEl.innerHTML = "";
      if (progressEl) progressEl.textContent = "Готово";
      if (questionEl) questionEl.textContent = "Результат";

      if (resultEl) {
        resultEl.className = "qt-result visible qt-result--" + res.level;
      }
      if (levelBadge) {
        levelBadge.className = "level-badge level-badge--" + res.level;
        levelBadge.textContent = res.title;
      }
      if (textEl) {
        textEl.innerHTML = res.lines.map(function (l) {
          return "<p>" + escapeHtml(l) + "</p>";
        }).join("");
      }
      if (linkEl) {
        linkEl.href = "handbook.html#" + res.handbookAnchor;
      }
    }

    renderStep();
  }

  /** Тихая регистрация SW, если пакет уже помечен готовым (обновления + стабильность на iOS). */
  function registerServiceWorkerIfReady() {
    if (!("serviceWorker" in navigator) || !isBundleMarkedReady()) return;
    navigator.serviceWorker.register("/offline/sw.js", { scope: "/offline/" }).catch(function () {});
  }

  document.addEventListener("DOMContentLoaded", function () {
    var page = document.body && document.body.getAttribute("data-page");
    registerServiceWorkerIfReady();
    setupInstallBanner();
    if (page === "quicktest") {
      setupQuickTest();
    }
  });
})();
