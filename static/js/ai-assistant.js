/**
 * VetGuardian — ИИ-ассистент: чат (gpt-4o-mini), голос (whisper-1), фото/видео (gpt-4o vision).
 * Запросы идут на этот же сайт (Flask-прокси → ProxyAPI), ключ только на сервере (.env OPENAI_API_KEY).
 */
(function () {
  "use strict";

  var API_CHAT = "/api/ai-assistant/chat";
  var API_TRANSCRIBE = "/api/ai-assistant/transcribe";
  /**
   * Иконки кнопок чата: файлы на диске — папка static/pictures/technical/
   * (в браузере URL начинается с /pictures/technical/). Замените PNG своими,
   * сохранив имена файлов, ИЛИ поменяйте пути ниже.
   */
  var IMG_MIC = "/pictures/technical/micro.png";
  var IMG_MIC_REC = "/pictures/technical/selected_micro.png";
  var IMG_DOC = "/pictures/technical/doc.png";
  var IMG_DOC_CHOSEN = "/pictures/technical/selected_doc.png";
  var STORAGE_KEY = "vetguardian_ai_chat_v1";
  var MAX_FILE_BYTES = 20 * 1024 * 1024;
  var RECORD_MAX_MS = 60000;
  var MODEL_CHAT = "gpt-4o-mini";
  var MODEL_VISION = "gpt-4o";
  var MODEL_WHISPER = "whisper-1";
  var WELCOME_MSG_ID = "vg_ai_welcome";

  var TEXT_SYSTEM =
    "Ты — ветеринарный помощник VetGuardian. Отвечай на русском языке, ясно и по делу. " +
    "Не ставь окончательный диагноз; при опасных симптомах рекомендуй срочно обратиться в клинику. " +
    "Структурируй ответ короткими абзацами при необходимости. " +
    "Не используй Markdown: не ставь символы #, **, __, обратные кавычки и не оформляй горизонтальные линии из дефисов.";

  var VISION_PROMPT =
    "Ты — ветеринарный помощник. Проанализируй это фото/видео питомца (обрати внимание на позу, выделения, раны, поведение) " +
    "и дай краткий анализ + уровень опасности (зелёный/жёлтый/красный) + что делать. " +
    "Пиши обычным текстом без Markdown (#, **, __ и т.п.).";

  var els = {};
  var state = {
    messages: [],
    busy: false,
    recorder: null,
    recordChunks: [],
    recording: false,
    recordStartedAt: 0,
    recordTimer: null,
    recordStopTimer: null,
    pendingFile: null,
    pendingObjectUrl: null,
    welcomeNeedsTypewriter: false,
    welcomeTypeStarted: false,
    welcomeTypingActive: false,
    inviewDone: false,
  };

  function uid() {
    return "m_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  function welcomeMessage() {
    return {
      id: WELCOME_MSG_ID,
      role: "assistant",
      kind: "text",
      text:
        "Здравствуйте! Я — ваш ветеринарный помощник. Опишите симптомы, задайте вопрос, отправьте голосовое сообщение или фото питомца — я помогу оценить состояние и дам рекомендации. Чем могу помочь?",
      createdAt: new Date().toISOString(),
    };
  }

  function clearAssistantChatStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function scrollToBottom() {
    var box = els.messages;
    if (box) box.scrollTop = box.scrollHeight;
  }

  function setTyping(on) {
    if (!els.typing) return;
    els.typing.classList.toggle("vg-ai-typing--hidden", !on);
    els.typing.setAttribute("aria-hidden", on ? "false" : "true");
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  /** Убирает типичный Markdown из ответа модели для отображения в чате */
  function stripMarkdownForDisplay(s) {
    if (!s) return "";
    var t = String(s);
    t = t.replace(/\r\n/g, "\n");
    t = t.replace(/^---+[\t \f\r]*$/gm, "");
    t = t.replace(/^#{1,6}\s*/gm, "");
    var i;
    for (i = 0; i < 40; i++) {
      var prev = t;
      t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
      t = t.replace(/__([^_]+)__/g, "$1");
      if (t === prev) break;
    }
    t = t.replace(/\*\*/g, "");
    t = t.replace(/`([^`]*)`/g, "$1");
    return t.trim();
  }

  function formatAssistantHtml(raw) {
    return escapeHtml(stripMarkdownForDisplay(raw)).replace(/\n/g, "<br>");
  }

  function renderMessage(m) {
    var row = document.createElement("div");
    row.className = "vg-ai-row vg-ai-row--" + (m.role === "user" ? "user" : "assistant");
    row.dataset.id = m.id;

    var av = document.createElement("div");
    av.className = "vg-ai-avatar";
    av.setAttribute("aria-hidden", "true");
    if (m.role === "user") {
      av.classList.add("vg-ai-avatar--user");
    } else {
      var img = document.createElement("img");
      img.src = "/pictures/logo%20mini.png";
      img.alt = "";
      av.appendChild(img);
    }

    var bubble = document.createElement("div");
    bubble.className =
      "vg-ai-bubble vg-ai-bubble--" +
      (m.role === "user" ? "user" : "assistant") +
      (m.error ? " vg-ai-bubble--error" : "");

    if (m.kind === "voice") {
      var t = document.createElement("div");
      t.className = "vg-ai-bubble-text";
      t.textContent = m.text || "";
      bubble.appendChild(t);
      if (m.audioDataUrl) {
        var aud = document.createElement("audio");
        aud.className = "vg-ai-audio";
        aud.controls = true;
        aud.preload = "metadata";
        aud.src = m.audioDataUrl;
        bubble.appendChild(aud);
      }
    } else if (m.kind === "media") {
      if (m.text) {
        var tt = document.createElement("div");
        tt.className = "vg-ai-bubble-text";
        tt.textContent = m.text;
        bubble.appendChild(tt);
      }
      if (m.thumbDataUrl) {
        var im = document.createElement("img");
        im.className = "vg-ai-thumb";
        im.src = m.thumbDataUrl;
        im.alt = m.fileName || "Вложение";
        bubble.appendChild(im);
      }
      if (m.fileName) {
        var meta = document.createElement("div");
        meta.className = "vg-ai-meta";
        meta.textContent = m.fileName;
        bubble.appendChild(meta);
      }
    } else {
      var div = document.createElement("div");
      div.className = "vg-ai-bubble-text";
      if (m.role === "assistant" && m.kind === "text" && !m.error) {
        if (state.welcomeNeedsTypewriter && m.id === WELCOME_MSG_ID) {
          div.textContent = "";
          div.setAttribute("data-typewriter", "1");
        } else {
          div.innerHTML = formatAssistantHtml(m.text || "");
        }
      } else {
        div.innerHTML = escapeHtml(m.text || "").replace(/\n/g, "<br>");
      }
      bubble.appendChild(div);
    }

    row.appendChild(av);
    row.appendChild(bubble);
    return row;
  }

  function renderAll() {
    if (!els.messages) return;
    els.messages.innerHTML = "";
    state.messages.forEach(function (m) {
      els.messages.appendChild(renderMessage(m));
    });
    scrollToBottom();
  }

  function pushMessage(m) {
    state.messages.push(m);
    if (els.messages) els.messages.appendChild(renderMessage(m));
    scrollToBottom();
  }

  function updateMessageText(id, text) {
    var m = state.messages.find(function (x) {
      return x.id === id;
    });
    if (m) m.text = text;
    var row = els.messages && els.messages.querySelector('[data-id="' + id + '"]');
    if (row) {
      var bubbleText = row.querySelector(".vg-ai-bubble-text");
      if (bubbleText) {
        var mm = state.messages.find(function (x) {
          return x.id === id;
        });
        if (mm && mm.role === "assistant" && mm.kind === "text" && !mm.error) {
          bubbleText.innerHTML = formatAssistantHtml(text || "");
        } else {
          bubbleText.innerHTML = escapeHtml(text || "").replace(/\n/g, "<br>");
        }
      }
    }
    scrollToBottom();
  }

  function apiErrorMessage(err) {
    if (!err) return "Сервис ИИ временно недоступен. Попробуйте позже.";
    var msg = String(err.message || err);
    if (/401|403|invalid.*key|incorrect api key/i.test(msg))
      return "Не удалось авторизоваться у провайдера API. Проверьте OPENAI_API_KEY в .env на сервере.";
    if (/503/.test(msg) || /не задан на сервере/i.test(msg))
      return "На сервере не задан OPENAI_API_KEY в файле .env (или переменных окружения).";
    if (/fetch|network|failed to fetch|load failed/i.test(msg))
      return "Нет соединения с сервером сайта. Убедитесь, что запущен Flask (python app.py) и открыт тот же адрес (например http://127.0.0.1:5000).";
    if (/429|rate/i.test(msg)) return "Слишком много запросов. Подождите немного и повторите.";
    return "Ошибка: " + msg;
  }

  function buildApiHistory() {
    var out = [];
    var slice = state.messages.slice(-24);
    slice.forEach(function (m) {
      if (m.role === "assistant") {
        if ((m.text || "").trim()) out.push({ role: "assistant", content: m.text });
        return;
      }
      if (m.role !== "user") return;
      if (m.kind === "text") {
        if (m.text) out.push({ role: "user", content: m.text });
        return;
      }
      if (m.kind === "voice") {
        var vt = (m.text || "").trim();
        if (vt) out.push({ role: "user", content: "[Голосовое сообщение] " + vt });
        return;
      }
      if (m.kind === "media") {
        var cap = (m.text || "").trim();
        var fn = m.fileName || "файл";
        out.push({
          role: "user",
          content:
            (cap ? cap + "\n\n" : "") +
            "[Пользователь отправил вложение для визуального анализа: " +
            fn +
            ". Ответ ассистента следует ниже в истории.]",
        });
        return;
      }
    });
    return out;
  }

  function readBlobAsDataURL(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        return resolve(r.result);
      };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function compressImageFile(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth;
          var h = img.naturalHeight;
          var scale = Math.min(1, maxSide / Math.max(w, h));
          var cw = Math.round(w * scale);
          var ch = Math.round(h * scale);
          var canvas = document.createElement("canvas");
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, cw, ch);
          var dataUrl = canvas.toDataURL("image/jpeg", quality);
          URL.revokeObjectURL(url);
          resolve(dataUrl);
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Не удалось прочитать изображение"));
      };
      img.src = url;
    });
  }

  function dataUrlToBase64(dataUrl) {
    var i = dataUrl.indexOf(",");
    return i === -1 ? dataUrl : dataUrl.slice(i + 1);
  }

  function extractVideoFrames(file, maxFrames) {
    return new Promise(function (resolve, reject) {
      var video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      var objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;

      function cleanup() {
        URL.revokeObjectURL(objectUrl);
      }

      video.onerror = function () {
        cleanup();
        reject(new Error("Не удалось открыть видео в браузере"));
      };

      video.onloadedmetadata = function () {
        var duration = video.duration;
        if (!duration || !isFinite(duration) || duration <= 0) duration = 1;
        var times = [0.15, duration * 0.35, duration * 0.7];
        var uniq = [];
        times.forEach(function (t) {
          if (t >= duration - 0.05) t = Math.max(0.05, duration - 0.15);
          if (uniq.indexOf(t) < 0) uniq.push(t);
        });
        uniq = uniq.slice(0, maxFrames || 4);

        var canvas = document.createElement("canvas");
        var ctx = canvas.getContext("2d");
        var vw = video.videoWidth;
        var vh = video.videoHeight;
        if (!vw || !vh) {
          cleanup();
          reject(new Error("Пустое видео"));
          return;
        }
        var maxSide = 1280;
        var scale = Math.min(1, maxSide / Math.max(vw, vh));
        canvas.width = Math.round(vw * scale);
        canvas.height = Math.round(vh * scale);

        var frames = [];
        var step = function (idx) {
          if (idx >= uniq.length) {
            cleanup();
            resolve(frames);
            return;
          }
          video.currentTime = uniq[idx];
          video.onseeked = function () {
            try {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              frames.push(canvas.toDataURL("image/jpeg", 0.82));
            } catch (e) {
              cleanup();
              reject(e);
              return;
            }
            step(idx + 1);
          };
        };
        step(0);
      };
    });
  }

  function prepareVisionParts(file, caption) {
    var name = (file.name || "upload").toLowerCase();
    var mime = file.type || "";
    var isVideo = /mp4|mov|quicktime|video/.test(mime) || /\.mp4$/.test(name) || /\.mov$/.test(name);

    if (isVideo) {
      return extractVideoFrames(file, 4).then(function (urls) {
        var parts = [{ type: "text", text: VISION_PROMPT + (caption ? "\n\nКомментарий владельца: " + caption : "") + "\n\n(Ниже — кадры из видео.)" }];
        urls.forEach(function (u) {
          parts.push({
            type: "image_url",
            image_url: { url: u, detail: "auto" },
          });
        });
        return { parts: parts, thumbDataUrl: urls[0] || null };
      });
    }

    return compressImageFile(file, 1536, 0.85).then(function (dataUrl) {
      var parts = [
        {
          type: "text",
          text: VISION_PROMPT + (caption ? "\n\nКомментарий владельца: " + caption : ""),
        },
        {
          type: "image_url",
          image_url: { url: dataUrl, detail: "auto" },
        },
      ];
      return { parts: parts, thumbDataUrl: dataUrl };
    });
  }

  function chatCompletionStream(body, onAccumulated) {
    return fetch(API_CHAT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ stream: true }, body)),
    }).then(function (res) {
      if (!res.ok)
        return res.text().then(function (t) {
          var j;
          try {
            j = JSON.parse(t);
          } catch (e) {
            j = null;
          }
          if (j && j.error && j.error.message) throw new Error(j.error.message);
          throw new Error(res.status + " " + (t || res.statusText));
        });
      if (!res.body || !res.body.getReader) {
        throw new Error("Стриминг не поддерживается в этом браузере");
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";
      var acc = "";

      function pump() {
        return reader.read().then(function (result) {
          buffer += decoder.decode(result.value || new Uint8Array(), { stream: !result.done });
          var sep;
          while ((sep = buffer.indexOf("\n\n")) >= 0) {
            var block = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            var lines = block.split("\n");
            for (var li = 0; li < lines.length; li++) {
              var line = lines[li].trim();
              if (!line.startsWith("data:")) continue;
              var payload = line.slice(5).trim();
              if (payload === "[DONE]") continue;
              var json;
              try {
                json = JSON.parse(payload);
              } catch (e) {
                continue;
              }
              if (json.error && json.error.message) throw new Error(json.error.message);
              var delta = json.choices && json.choices[0] && json.choices[0].delta;
              if (delta && delta.content) {
                acc += delta.content;
                onAccumulated(acc);
              }
            }
          }
          if (result.done) return acc;
          return pump();
        });
      }
      return pump();
    });
  }

  function chatCompletionSync(body) {
    return fetch(API_CHAT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ stream: false }, body)),
    }).then(function (res) {
      return res.text().then(function (t) {
        var json;
        try {
          json = JSON.parse(t);
        } catch (e) {
          json = null;
        }
        if (!res.ok) {
          var em = (json && json.error && json.error.message) || t || res.statusText;
          throw new Error(res.status + " " + em);
        }
        if (!json) throw new Error(t || "Пустой ответ");
        var ch = json.choices && json.choices[0];
        if (!ch || !ch.message) {
          if (json.error && json.error.message) throw new Error(json.error.message);
          throw new Error("Пустой ответ API");
        }
        return ch.message.content || "";
      });
    });
  }

  function appendAssistantShell() {
    var assistantId = uid();
    state.messages.push({
      id: assistantId,
      role: "assistant",
      kind: "text",
      text: "",
      createdAt: new Date().toISOString(),
    });
    if (els.messages) els.messages.appendChild(renderMessage(state.messages[state.messages.length - 1]));
    scrollToBottom();
    return assistantId;
  }

  function runChatCompletion(assistantId, payload) {
    state.busy = true;
    setTyping(true);
    if (els.send) els.send.disabled = true;
    if (els.text) els.text.disabled = true;

    var onAcc = function (full) {
      updateMessageText(assistantId, full);
    };

    return chatCompletionStream(payload, onAcc)
      .catch(function () {
        return chatCompletionSync(Object.assign({}, payload, { stream: false })).then(function (full) {
          updateMessageText(assistantId, full);
          return full;
        });
      })
      .catch(function (err) {
        updateMessageText(assistantId, apiErrorMessage(err));
        var m = state.messages.find(function (x) {
          return x.id === assistantId;
        });
        if (m) m.error = true;
        var row = els.messages && els.messages.querySelector('[data-id="' + assistantId + '"] .vg-ai-bubble');
        if (row) row.classList.add("vg-ai-bubble--error");
        return Promise.reject(err);
      })
      .finally(function () {
        state.busy = false;
        setTyping(false);
        if (els.send) els.send.disabled = false;
        if (els.text) els.text.disabled = false;
      });
  }

  /** @param {string} userText @param {{ skipUserMessage?: boolean }} [opts] */
  function sendChat(userText, opts) {
    opts = opts || {};

    if (!opts.skipUserMessage) {
      pushMessage({
        id: uid(),
        role: "user",
        kind: "text",
        text: userText,
        createdAt: new Date().toISOString(),
      });
    }

    var assistantId = appendAssistantShell();
    var apiMessages = [{ role: "system", content: TEXT_SYSTEM }].concat(buildApiHistory());
    var payload = {
      model: MODEL_CHAT,
      messages: apiMessages,
      temperature: 0.5,
      max_tokens: 1800,
    };
    return runChatCompletion(assistantId, payload);
  }

  function sendVision(file, caption) {
    return prepareVisionParts(file, caption)
      .catch(function (err) {
        pushMessage({
          id: uid(),
          role: "assistant",
          kind: "text",
          text: apiErrorMessage(err),
          error: true,
          createdAt: new Date().toISOString(),
        });
        return Promise.reject(err);
      })
      .then(function (prepared) {
        pushMessage({
          id: uid(),
          role: "user",
          kind: "media",
          text: (caption || "").trim(),
          fileName: file.name || "файл",
          thumbDataUrl: prepared.thumbDataUrl,
          createdAt: new Date().toISOString(),
        });

        var hist = buildApiHistory();
        var apiMessages = [{ role: "system", content: TEXT_SYSTEM }];
        if (hist.length) {
          hist.slice(0, -1).forEach(function (h) {
            apiMessages.push(h);
          });
        }
        apiMessages.push({ role: "user", content: prepared.parts });

        var assistantId = appendAssistantShell();
        var payload = {
          model: MODEL_VISION,
          messages: apiMessages,
          temperature: 0.4,
          max_tokens: 2000,
        };
        return runChatCompletion(assistantId, payload);
      })
      .then(function () {
        clearPendingAttachment();
        if (els.text) {
          els.text.value = "";
          autoResize();
        }
      })
      .catch(function () {
        /* ошибка чата уже в пузырьке ассистента */
      });
  }

  /** Декодирует WebM/Ogg в памяти и собирает моно PCM WAV 16 kHz — LiteLLM стабильно ест WAV. */
  function encodeWavPcm16(samplesF32, sampleRate) {
    var n = samplesF32.length;
    var buf = new ArrayBuffer(44 + n * 2);
    var view = new DataView(buf);
    function writeStr(off, s) {
      for (var i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    }
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + n * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, n * 2, true);
    var off = 44;
    for (var i = 0; i < n; i++) {
      var s = Math.max(-1, Math.min(1, samplesF32[i]));
      var s16 = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
      view.setInt16(off, s16, true);
      off += 2;
    }
    return new Blob([buf], { type: "audio/wav" });
  }

  function blobToWav16kMono(blob) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !blob.arrayBuffer) return Promise.resolve(null);
    var ctx = new AC();
    return blob
      .arrayBuffer()
      .then(function (ab) {
        return ctx.decodeAudioData(ab.slice(0));
      })
      .then(function (audioBuf) {
        var p = ctx.close ? ctx.close() : Promise.resolve();
        return p.then(function () {
          return audioBuf;
        });
      })
      .then(function (audioBuf) {
        var dur = audioBuf.duration;
        if (!dur || dur <= 0 || dur > 120) return null;
        var frames = Math.max(1, Math.ceil(16000 * dur));
        var offline = new OfflineAudioContext(1, frames, 16000);
        var src = offline.createBufferSource();
        src.buffer = audioBuf;
        src.connect(offline.destination);
        src.start(0);
        return offline.startRendering();
      })
      .then(function (rendered) {
        if (!rendered || !rendered.getChannelData(0).length) return null;
        return encodeWavPcm16(rendered.getChannelData(0), 16000);
      })
      .catch(function () {
        try {
          ctx.close();
        } catch (e) {}
        return null;
      });
  }

  function transcribe(blob) {
    var m = (blob.type || "").toLowerCase();
    var ext = /wav/.test(m) ? "wav" : /ogg/.test(m) ? "ogg" : "webm";
    var fd = new FormData();
    fd.append("file", blob, "voice." + ext);
    fd.append("model", MODEL_WHISPER);
    fd.append("language", "ru");
    return fetch(API_TRANSCRIBE, {
      method: "POST",
      body: fd,
    }).then(function (res) {
      return res.text().then(function (raw) {
        var json;
        try {
          json = JSON.parse(raw);
        } catch (e) {
          json = null;
        }
        if (!res.ok) {
          var msg = (json && json.error && json.error.message) || raw || res.statusText;
          throw new Error(msg);
        }
        if (json && json.text != null) return String(json.text).trim();
        return (raw || "").trim();
      });
    });
  }

  function stopRecording() {
    if (!state.recording || !state.recorder) return;
    if (state.recordTimer) {
      clearInterval(state.recordTimer);
      state.recordTimer = null;
    }
    if (state.recordStopTimer) {
      clearTimeout(state.recordStopTimer);
      state.recordStopTimer = null;
    }
    try {
      state.recorder.stop();
    } catch (e) {}
  }

  function startRecording() {
    if (state.busy) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      pushMessage({
        id: uid(),
        role: "assistant",
        kind: "text",
        text: "Браузер не поддерживает запись с микрофона.",
        error: true,
        createdAt: new Date().toISOString(),
      });
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (stream) {
        state.recordChunks = [];
        var mime = "audio/webm";
        if (!window.MediaRecorder) {
          mime = "";
        } else if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mime = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          mime = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
          mime = "audio/ogg;codecs=opus";
        } else {
          mime = "";
        }

        var rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        state.recorder = rec;
        state.recording = true;
        setMicRecordingUI(true);

        rec.ondataavailable = function (e) {
          if (e.data && e.data.size) state.recordChunks.push(e.data);
        };

        rec.onstop = function () {
          stream.getTracks().forEach(function (t) {
            t.stop();
          });
          state.recording = false;
          state.recorder = null;
          setMicRecordingUI(false);

          var blob = new Blob(state.recordChunks, { type: rec.mimeType || "audio/webm" });
          state.recordChunks = [];
          if (!blob.size) return;

          readBlobAsDataURL(blob)
            .then(function (dataUrl) {
              var msgId = uid();
              pushMessage({
                id: msgId,
                role: "user",
                kind: "voice",
                text: "🎤 Обработка голоса…",
                audioDataUrl: dataUrl,
                createdAt: new Date().toISOString(),
              });

              state.busy = true;
              setTyping(true);
              if (els.send) els.send.disabled = true;

              return blobToWav16kMono(blob).then(function (wavBlob) {
                var toSend = wavBlob && wavBlob.size > 800 ? wavBlob : blob;
                return transcribe(toSend);
              })
                .then(function (text) {
                  var m = state.messages.find(function (x) {
                    return x.id === msgId;
                  });
                  if (m) {
                    m.text = text || "(пустая расшифровка)";
                    renderAll();
                  }
                  if (!text) {
                    pushMessage({
                      id: uid(),
                      role: "assistant",
                      kind: "text",
                      text: "Не удалось распознать речь. Попробуйте записать ещё раз ближе к микрофону.",
                      error: true,
                      createdAt: new Date().toISOString(),
                    });
                    return;
                  }
                  return sendChat(text, { skipUserMessage: true });
                })
                .catch(function (err) {
                  pushMessage({
                    id: uid(),
                    role: "assistant",
                    kind: "text",
                    text: apiErrorMessage(err),
                    error: true,
                    createdAt: new Date().toISOString(),
                  });
                })
                .finally(function () {
                  state.busy = false;
                  setTyping(false);
                  if (els.send) els.send.disabled = false;
                  if (els.text) els.text.disabled = false;
                });
            })
            .catch(function () {
              pushMessage({
                id: uid(),
                role: "assistant",
                kind: "text",
                text: "Не удалось сохранить запись.",
                error: true,
                createdAt: new Date().toISOString(),
              });
              state.busy = false;
              setTyping(false);
              if (els.send) els.send.disabled = false;
              if (els.text) els.text.disabled = false;
            });
        };

        /* Без timeslice: один фрагмент при stop — корректный WebM/Ogg с длительностью для Whisper/LiteLLM */
        rec.start();
        state.recordStartedAt = Date.now();
        state.recordStopTimer = setTimeout(function () {
          stopRecording();
        }, RECORD_MAX_MS);

        state.recordTimer = setInterval(function () {
          if (Date.now() - state.recordStartedAt >= RECORD_MAX_MS) stopRecording();
        }, 500);
      })
      .catch(function () {
        pushMessage({
          id: uid(),
          role: "assistant",
          kind: "text",
          text: "Не удалось получить доступ к микрофону. Разрешите запись в настройках браузера.",
          error: true,
          createdAt: new Date().toISOString(),
        });
      });
  }

  function setAttachIconChosen(on) {
    if (els.attachImg) els.attachImg.src = on ? IMG_DOC_CHOSEN : IMG_DOC;
  }

  function setMicRecordingUI(on) {
    if (els.micStack) els.micStack.classList.toggle("vg-ai-mic-stack--recording", !!on);
    if (els.micImg) els.micImg.src = on ? IMG_MIC_REC : IMG_MIC;
    if (els.mic) {
      els.mic.setAttribute("aria-label", on ? "Остановить запись" : "Записать голосовое сообщение");
      els.mic.title = on ? "Остановить запись" : "Голосовое сообщение";
    }
  }

  function clearPendingAttachment() {
    if (state.pendingObjectUrl) {
      try {
        URL.revokeObjectURL(state.pendingObjectUrl);
      } catch (e) {}
      state.pendingObjectUrl = null;
    }
    state.pendingFile = null;
    setAttachIconChosen(false);
    if (els.pendingWrap) els.pendingWrap.hidden = true;
    if (els.pendingThumb) {
      els.pendingThumb.removeAttribute("src");
      els.pendingThumb.style.display = "none";
    }
    if (els.pendingName) els.pendingName.textContent = "";
  }

  function updatePendingUI() {
    if (!els.pendingWrap || !els.pendingName || !els.pendingThumb) return;
    if (!state.pendingFile) {
      clearPendingAttachment();
      return;
    }
    els.pendingWrap.hidden = false;
    els.pendingName.textContent = state.pendingFile.name || "файл";
    if (state.pendingObjectUrl) {
      try {
        URL.revokeObjectURL(state.pendingObjectUrl);
      } catch (e) {}
      state.pendingObjectUrl = null;
    }
    var mime = (state.pendingFile.type || "").toLowerCase();
    if (mime.indexOf("image/") === 0) {
      state.pendingObjectUrl = URL.createObjectURL(state.pendingFile);
      els.pendingThumb.src = state.pendingObjectUrl;
      els.pendingThumb.style.display = "block";
    } else {
      els.pendingThumb.removeAttribute("src");
      els.pendingThumb.style.display = "none";
    }
  }

  function beginWelcomeTypewriter() {
    if (state.welcomeTypingActive) return;
    var msg = state.messages.find(function (x) {
      return x.id === WELCOME_MSG_ID;
    });
    if (!msg || !state.welcomeNeedsTypewriter) return;
    state.welcomeTypingActive = true;
    var full = msg.text || "";
    var el = els.messages && els.messages.querySelector('[data-id="' + WELCOME_MSG_ID + '"] .vg-ai-bubble-text');
    if (!el) return;
    var i = 0;
    var step = 2;
    function tick() {
      if (i >= full.length) {
        state.welcomeNeedsTypewriter = false;
        el.removeAttribute("data-typewriter");
        el.innerHTML = formatAssistantHtml(full);
        return;
      }
      i = Math.min(i + step, full.length);
      var piece = full.slice(0, i);
      el.innerHTML = escapeHtml(piece).replace(/\n/g, "<br>");
      scrollToBottom();
      window.setTimeout(tick, 20);
    }
    tick();
  }

  function onMicClick() {
    if (state.busy && !state.recording) return;
    if (state.recording) {
      stopRecording();
      return;
    }
    startRecording();
  }

  function onAttachClick() {
    if (els.file) els.file.click();
  }

  function onFileSelected(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (els.file) els.file.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      pushMessage({
        id: uid(),
        role: "assistant",
        kind: "text",
        text: "Файл больше 20 МБ. Выберите файл меньшего размера.",
        error: true,
        createdAt: new Date().toISOString(),
      });
      return;
    }
    state.pendingFile = file;
    setAttachIconChosen(true);
    updatePendingUI();
  }

  function onSendClick() {
    if (state.busy) return;
    var t = (els.text && els.text.value.trim()) || "";
    if (state.pendingFile) {
      sendVision(state.pendingFile, t);
      return;
    }
    if (!t) return;
    if (els.text) els.text.value = "";
    autoResize();
    sendChat(t);
  }

  function onTextKeydown(ev) {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      onSendClick();
    }
  }

  function autoResize() {
    if (!els.text) return;
    els.text.style.height = "auto";
    els.text.style.height = Math.min(els.text.scrollHeight, 160) + "px";
  }

  function init() {
    els.section = document.getElementById("vgAiAssistantSection");
    els.messages = document.getElementById("vgAiMessages");
    els.typing = document.getElementById("vgAiTyping");
    els.mic = document.getElementById("vgAiMicBtn");
    els.micStack = document.getElementById("vgAiMicStack");
    els.micImg = document.getElementById("vgAiMicImg");
    els.recPulse = document.getElementById("vgAiRecPulse");
    els.attach = document.getElementById("vgAiAttachBtn");
    els.attachImg = document.getElementById("vgAiAttachImg");
    els.file = document.getElementById("vgAiFileInput");
    els.text = document.getElementById("vgAiTextInput");
    els.send = document.getElementById("vgAiSendBtn");
    els.pendingWrap = document.getElementById("vgAiPendingWrap");
    els.pendingThumb = document.getElementById("vgAiPendingThumb");
    els.pendingName = document.getElementById("vgAiPendingName");
    els.pendingRemove = document.getElementById("vgAiPendingRemove");

    if (!els.messages) return;

    clearAssistantChatStorage();
    state.messages = [welcomeMessage()];
    state.welcomeNeedsTypewriter = true;

    renderAll();

    function triggerInviewOnce() {
      if (state.inviewDone) return;
      state.inviewDone = true;
      if (els.section) els.section.classList.add("vg-ai-section--inview");
      if (!state.welcomeTypeStarted && state.welcomeNeedsTypewriter) {
        state.welcomeTypeStarted = true;
        window.setTimeout(beginWelcomeTypewriter, 450);
      }
    }

    if (els.section && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              triggerInviewOnce();
              io.disconnect();
            }
          });
        },
        { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
      );
      io.observe(els.section);
      window.setTimeout(function () {
        if (!els.section) return;
        var r = els.section.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.92 && r.bottom > 40) triggerInviewOnce();
      }, 400);
    } else {
      triggerInviewOnce();
    }

    if (els.pendingRemove) els.pendingRemove.addEventListener("click", clearPendingAttachment);

    setMicRecordingUI(false);
    setAttachIconChosen(false);

    if (els.send) els.send.addEventListener("click", onSendClick);
    if (els.text) {
      els.text.addEventListener("keydown", onTextKeydown);
      els.text.addEventListener("input", autoResize);
    }
    if (els.mic) els.mic.addEventListener("click", onMicClick);
    if (els.attach) els.attach.addEventListener("click", onAttachClick);
    if (els.file) els.file.addEventListener("change", onFileSelected);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
