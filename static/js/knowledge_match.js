/**
 * Локальное сопоставление ответов с veterinary_knowledge.json —
 * логика зеркалит knowledge_engine.py (evaluate / score_symptoms).
 */
(function (global) {
  "use strict";

  function tokenizePrimary(text) {
    if (text == null || !String(text).trim()) return [];
    var m = String(text).toLowerCase().match(/[а-яёa-z0-9]+/g);
    if (!m) return [];
    return m.filter(function (w) {
      return w.length >= 3;
    });
  }

  function primaryMatchScore(primary, condition) {
    var words = tokenizePrimary(primary);
    if (!words.length) return 0;
    var blob = [condition.id || "", condition.name || "", condition.description || ""].join(" ").toLowerCase();
    var hits = 0;
    for (var i = 0; i < words.length; i++) {
      if (blob.indexOf(words[i]) !== -1) hits++;
    }
    return Math.min(1, hits / Math.max(words.length, 1));
  }

  function ruleMatches(rule, val) {
    var expected = rule.value !== undefined && rule.value !== null ? rule.value : rule.expected;
    var matchType = rule.match || "exact";
    if (val === undefined || val === null) return false;
    var s = String(val).trim().toLowerCase();
    if (matchType === "min") {
      var vf = parseFloat(val);
      var ef = parseFloat(expected);
      if (isNaN(vf) || isNaN(ef)) return false;
      return vf >= ef;
    }
    if (matchType === "any" || Object.prototype.toString.call(expected) === "[object Array]") {
      var lst = Array.isArray(expected) ? expected : [expected];
      for (var i = 0; i < lst.length; i++) {
        if (s === String(lst[i]).trim().toLowerCase()) return true;
      }
      return false;
    }
    return s === String(expected).trim().toLowerCase();
  }

  function scoreSymptoms(answers, condition) {
    var rules = condition.symptom_rules || [];
    if (!rules.length) return 0;
    var total = 0;
    var matched = 0;
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var key = rule.question_key || rule.key;
      var w = parseFloat(rule.weight != null ? rule.weight : 1);
      if (isNaN(w)) w = 1;
      total += w;
      var val = answers[key];
      if (ruleMatches(rule, val)) matched += w;
    }
    return total ? matched / total : 0;
  }

  function evaluate(answers, primaryConcern, kb) {
    var primary = (primaryConcern || "").trim();
    var conditionsList = (kb && kb.conditions) || [];
    var results = [];
    for (var i = 0; i < conditionsList.length; i++) {
      var cond = conditionsList[i];
      var score = scoreSymptoms(answers, cond);
      if (score <= 0) continue;
      var pm = primaryMatchScore(primary, cond);
      var cid = cond.id || "";
      var finalP;
      if (primary) {
        var combined = 0.5 * score + 0.5 * Math.max(score * 0.35, pm);
        if (cid === "observation" && pm < 0.12) combined *= 0.18;
        finalP = Math.min(1, combined);
      } else {
        finalP = score;
      }
      results.push({
        id: cid,
        name: cond.name || "Состояние",
        description: (cond.description || "").trim(),
        recommendations: cond.recommendations || [],
        danger_level: cond.danger_level || "yellow",
        probability: Math.round(finalP * 100) / 100,
      });
    }
    results.sort(function (a, b) {
      return b.probability - a.probability;
    });

    if (!results.length) {
      return {
        danger_level: "green",
        conditions: [],
        summary:
          "По опросу явных опасных состояний не выявлено. Рекомендуется наблюдение.",
        immediate_actions: [],
        need_vet: false,
      };
    }

    var top = results.slice(0, 5);
    var danger_level = "green";
    for (var j = 0; j < top.length; j++) {
      var d = top[j].danger_level || "green";
      if (d === "red") {
        danger_level = "red";
        break;
      }
      if (d === "yellow" && danger_level !== "red") danger_level = "yellow";
    }
    var need_vet = danger_level === "yellow" || danger_level === "red";
    var immediate_actions = [];
    var seen = {};
    for (var k = 0; k < top.length; k++) {
      var recs = top[k].recommendations || [];
      for (var r = 0; r < recs.length && r < 2; r++) {
        var a = recs[r];
        if (a && !seen[a]) {
          seen[a] = true;
          immediate_actions.push(a);
        }
      }
      if (immediate_actions.length >= 5) break;
    }

    var summary_parts = ["Вероятные состояния (медицинская база знаний):\n"];
    for (var t = 0; t < top.length; t++) {
      var tr = top[t];
      var pct = Math.round(tr.probability * 100);
      summary_parts.push(String(t + 1) + ".\t" + tr.name + "\t" + pct + " %");
      summary_parts.push("\t" + (tr.description || "").trim());
      summary_parts.push("");
    }
    var summary =
      summary_parts.length > 1
        ? summary_parts.join("\n").trim()
        : "По опросу явных опасных состояний не выявлено. Рекомендуется наблюдение.";

    return {
      danger_level: danger_level,
      conditions: top,
      summary: summary,
      immediate_actions: immediate_actions,
      need_vet: need_vet,
    };
  }

  /**
   * Ограничивает топ состояний списком id категории; если после фильтра пусто — полный evaluate.
   */
  function evaluateForCategory(answers, primaryConcern, kb, allowedIds) {
    var full = evaluate(answers, primaryConcern, kb);
    if (!allowedIds || !allowedIds.length) return full;
    var filtered = (full.conditions || []).filter(function (c) {
      return allowedIds.indexOf(c.id) !== -1;
    });
    if (!filtered.length) return full;

    var danger_level = "green";
    for (var i = 0; i < filtered.length; i++) {
      var d = filtered[i].danger_level || "green";
      if (d === "red") {
        danger_level = "red";
        break;
      }
      if (d === "yellow" && danger_level !== "red") danger_level = "yellow";
    }
    var need_vet = danger_level === "yellow" || danger_level === "red";
    var immediate_actions = [];
    var seen = {};
    for (var j = 0; j < filtered.length; j++) {
      var recs = filtered[j].recommendations || [];
      for (var r = 0; r < Math.min(2, recs.length); r++) {
        var a = recs[r];
        if (a && !seen[a]) {
          seen[a] = true;
          immediate_actions.push(a);
        }
      }
      if (immediate_actions.length >= 5) break;
    }

    var slice = filtered.slice(0, 5);
    var summary_parts = ["Вероятные состояния по выбранной категории:\n"];
    for (var t = 0; t < slice.length; t++) {
      var tr = slice[t];
      summary_parts.push(String(t + 1) + ".\t" + tr.name + "\t" + Math.round(tr.probability * 100) + " %");
      summary_parts.push("\t" + (tr.description || "").trim());
      summary_parts.push("");
    }

    return {
      danger_level: danger_level,
      conditions: slice,
      summary: summary_parts.join("\n").trim(),
      immediate_actions: immediate_actions.slice(0, 5),
      need_vet: need_vet,
    };
  }

  global.VGKnowledgeMatch = {
    evaluate: evaluate,
    evaluateForCategory: evaluateForCategory,
    scoreSymptoms: scoreSymptoms,
    ruleMatches: ruleMatches,
  };
})(typeof window !== "undefined" ? window : this);
