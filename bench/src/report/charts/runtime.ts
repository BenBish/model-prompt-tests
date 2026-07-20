/**
 * Inline vanilla-JS runtime shipped inside the self-contained report HTML.
 * Handles tooltips for [data-tip] chart marks, sortable summary tables,
 * model/prompt filter chips, and a light/dark theme toggle. No dependencies,
 * no build step -- this string is embedded verbatim in a <script> tag.
 */
export function chartRuntimeScript(): string {
  return `
(function () {
  "use strict";

  // ---- Tooltip -----------------------------------------------------------
  var tip = document.createElement("div");
  tip.className = "chart-tooltip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.appendChild(tip);

  function showTip(target, x, y) {
    var raw = target.getAttribute("data-tip");
    if (!raw) return;
    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return;
    }
    tip.textContent = "";
    var title = document.createElement("div");
    title.className = "chart-tooltip-title";
    title.textContent = data.title || "";
    tip.appendChild(title);
    (data.lines || []).forEach(function (line) {
      var row = document.createElement("div");
      row.className = "chart-tooltip-line";
      row.textContent = line;
      tip.appendChild(row);
    });
    tip.hidden = false;
    var pad = 12;
    var maxX = window.innerWidth - tip.offsetWidth - pad;
    var maxY = window.innerHeight - tip.offsetHeight - pad;
    tip.style.left = Math.max(pad, Math.min(x + 14, maxX)) + "px";
    tip.style.top = Math.max(pad, Math.min(y + 14, maxY)) + "px";
  }

  function hideTip() {
    tip.hidden = true;
  }

  document.addEventListener("pointermove", function (event) {
    var target = event.target.closest ? event.target.closest("[data-tip]") : null;
    if (target) showTip(target, event.clientX, event.clientY);
    else hideTip();
  });
  document.addEventListener("pointerleave", hideTip, true);
  document.addEventListener(
    "focusin",
    function (event) {
      var target = event.target.closest ? event.target.closest("[data-tip]") : null;
      if (!target) return;
      var rect = target.getBoundingClientRect();
      showTip(target, rect.left + rect.width / 2, rect.top);
    },
    true,
  );
  document.addEventListener(
    "focusout",
    function (event) {
      var target = event.target.closest ? event.target.closest("[data-tip]") : null;
      if (target) hideTip();
    },
    true,
  );

  // ---- Sortable tables ----------------------------------------------------
  document.querySelectorAll("table.sortable").forEach(function (table) {
    var state = { key: null, dir: 1 };
    table.querySelectorAll("thead th[data-sort-key]").forEach(function (th) {
      th.tabIndex = 0;
      th.addEventListener("click", function () {
        sortBy(th.getAttribute("data-sort-key"));
      });
      th.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          sortBy(th.getAttribute("data-sort-key"));
        }
      });
    });

    function sortBy(key) {
      state.dir = state.key === key ? -state.dir : 1;
      state.key = key;
      var tbody = table.querySelector("tbody");
      var rows = Array.prototype.slice.call(tbody.querySelectorAll("tr"));
      rows.sort(function (a, b) {
        var av = cellValue(a, key);
        var bv = cellValue(b, key);
        if (av === bv) return 0;
        return (av < bv ? -1 : 1) * state.dir;
      });
      rows.forEach(function (row) {
        tbody.appendChild(row);
      });
      table.querySelectorAll("thead th[data-sort-key]").forEach(function (th) {
        th.classList.toggle("sorted", th.getAttribute("data-sort-key") === key);
        th.classList.toggle("sorted-desc", th.getAttribute("data-sort-key") === key && state.dir === -1);
      });
    }

    function cellValue(row, key) {
      var cell = row.querySelector('[data-col="' + key + '"]');
      if (!cell) return "";
      var raw = cell.getAttribute("data-value");
      if (raw !== null) {
        var num = Number(raw);
        return Number.isNaN(num) ? raw : num;
      }
      return cell.textContent.trim();
    }
  });

  // ---- Model filter chips --------------------------------------------------
  var filterBar = document.querySelector(".filter-bar");
  if (filterBar) {
    var active = null;
    filterBar.querySelectorAll("[data-filter-model]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var value = chip.getAttribute("data-filter-model");
        active = active === value ? null : value;
        filterBar.querySelectorAll("[data-filter-model]").forEach(function (c) {
          c.classList.toggle("active", c.getAttribute("data-filter-model") === active);
        });
        document.querySelectorAll("[data-model]").forEach(function (el) {
          var show = !active || el.getAttribute("data-model") === active;
          el.classList.toggle("filtered-out", !show);
        });
      });
    });
  }

  // ---- Theme toggle ---------------------------------------------------------
  var themeToggle = document.querySelector(".theme-toggle");
  if (themeToggle) {
    var stored = null;
    try {
      stored = localStorage.getItem("bench-report-theme");
    } catch (e) {}
    if (stored) document.documentElement.setAttribute("data-theme", stored);
    updateThemeLabel();

    themeToggle.addEventListener("click", function () {
      var current = document.documentElement.getAttribute("data-theme");
      var next = current === "dark" ? "light" : current === "light" ? null : "dark";
      if (next) document.documentElement.setAttribute("data-theme", next);
      else document.documentElement.removeAttribute("data-theme");
      try {
        if (next) localStorage.setItem("bench-report-theme", next);
        else localStorage.removeItem("bench-report-theme");
      } catch (e) {}
      updateThemeLabel();
    });
  }

  function updateThemeLabel() {
    if (!themeToggle) return;
    var current = document.documentElement.getAttribute("data-theme");
    themeToggle.textContent = current === "dark" ? "Dark" : current === "light" ? "Light" : "Auto";
  }
})();
`;
}
