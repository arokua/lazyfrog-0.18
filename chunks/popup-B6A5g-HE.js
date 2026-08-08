const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["chunks/exportAllData-DpxCAw9X.js","chunks/missions-D8fOGyOo.js"])))=>i.map(i=>d[i]);
import { c as createLucideIcon, F as getEssenceFilterOptions, G as getMissionStats, r as reactExports, j as jsxRuntimeExports, d as ChevronDown, C as ChevronRight, k as ChartColumn, l as Star, B as Bug, n as getTimeSinceBuild, P as Play, S as Settings, V as VERSION, _ as __vitePreload, m as clientExports, X as getNextMissions, I as getAutomationFilters, M as normalizeAutomationFilters, v as getEssenceLootDictionary } from "./missions-D8fOGyOo.js";
/**
 * @license lucide-react v0.546.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$3 = [
  [
    "path",
    {
      d: "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5",
      key: "mvr1a0"
    }
  ]
];
const Heart = createLucideIcon("heart", __iconNode$3);
/**
 * @license lucide-react v0.546.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$2 = [
  ["path", { d: "M3 5h.01", key: "18ugdj" }],
  ["path", { d: "M3 12h.01", key: "nlz23k" }],
  ["path", { d: "M3 19h.01", key: "noohij" }],
  ["path", { d: "M8 5h13", key: "1pao27" }],
  ["path", { d: "M8 12h13", key: "1za7za" }],
  ["path", { d: "M8 19h13", key: "m83p4d" }]
];
const List = createLucideIcon("list", __iconNode$2);
/**
 * @license lucide-react v0.546.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$1 = [
  ["rect", { x: "14", y: "3", width: "5", height: "18", rx: "1", key: "kaeet6" }],
  ["rect", { x: "5", y: "3", width: "5", height: "18", rx: "1", key: "1wsw3u" }]
];
const Pause = createLucideIcon("pause", __iconNode$1);
/**
 * @license lucide-react v0.546.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode = [
  [
    "path",
    {
      d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z",
      key: "1ngwbx"
    }
  ]
];
const Wrench = createLucideIcon("wrench", __iconNode);
function normalizeMissionDifficulty(mission) {
  const numeric = Number(mission?.difficulty);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.max(1, Math.min(5, Math.round(numeric)));
  }
  const fallback = Number(mission?.stars);
  if (Number.isFinite(fallback) && fallback > 0) {
    return Math.max(1, Math.min(5, Math.round(fallback)));
  }
  return 0;
}
function missionPermalinkForPopup(mission) {
  if (mission?.permalink) return mission.permalink;
  const postId = mission?.postId || "";
  const shortId = postId.startsWith("t3_") ? postId.slice(3) : postId;
  if (!shortId) return null;
  return `https://www.reddit.com/r/SwordAndSupperGame/comments/${shortId}/`;
}
function MissionStats({ stats }) {
  const [showStats, setShowStats] = reactExports.useState(() => {
    const saved = localStorage.getItem("popup.showStats");
    return saved !== null ? JSON.parse(saved) : true;
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "collapsible-section", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "section-header", onClick: () => setShowStats(!showStats), children: [
      showStats ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { size: 16 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { size: 16 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ChartColumn, { size: 14 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Mission Stats" })
    ] }),
    showStats && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "section-content",
        style: { padding: "8px 16px 12px 16px" },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: "stat-row",
              style: { padding: "4px 0", fontSize: "13px" },
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "stat-label", children: "Queued:" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "stat-value", children: [
                  stats.queued,
                  " missions"
                ] })
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: "stat-row",
              style: { padding: "4px 0", fontSize: "13px" },
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "stat-label", children: "Total:" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "stat-value", children: [
                  stats.total,
                  " missions"
                ] })
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: "stat-row",
              style: { padding: "4px 0", fontSize: "13px" },
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "stat-label", children: "Cleared:" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "stat-value", children: [
                  stats.cleared,
                  " missions"
                ] })
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: "stat-row",
              style: { padding: "4px 0", fontSize: "13px" },
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "stat-label", children: "Today:" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "stat-value", children: [
                  stats.todayCleared,
                  " cleared"
                ] })
              ]
            }
          )
        ]
      }
    )
  ] });
}
const NextMissions = ({
  nextMissions,
  showSection,
  onToggle
}) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "collapsible-section", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "section-header", onClick: onToggle, children: [
      showSection ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { size: 16 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { size: 16 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(List, { size: 14 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Mission Queue" })
    ] }),
    showSection && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "section-content", children: nextMissions.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { style: { color: "#a1a1aa", fontSize: "13px", padding: "8px 0" }, children: "No missions match your current filters" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "next-missions-list", children: nextMissions.map((mission, index) => {
      const difficulty = normalizeMissionDifficulty(mission);
      const permalink = missionPermalinkForPopup(mission);
      const title = mission.missionTitle || mission.foodName || "Unknown Mission";
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "next-mission-item", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mission-index", children: index + 1 }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mission-details", children: [
          permalink ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            "a",
            {
              className: "mission-title mission-title-link",
              href: permalink,
              target: "_blank",
              rel: "noopener noreferrer",
              onClick: (event) => event.stopPropagation(),
              children: title
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mission-title", children: title }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mission-meta", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mission-difficulty", children: difficulty > 0 ? Array.from({ length: difficulty }).map((_, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(Star, { size: 10, fill: "#eab308", color: "#eab308" }, i)) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mission-difficulty-unknown", children: mission.devvitEnrichedAt ? "N/A" : "?" }) }),
            mission.minLevel != null && mission.maxLevel != null ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "mission-level", children: [
              "Lv ",
              mission.minLevel,
              "-",
              mission.maxLevel
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mission-level mission-level-unknown", children: "Lv ?" })
          ] })
        ] })
      ] }, mission.postId);
    }) }) })
  ] });
};
const MissionFilters = ({
  filters,
  essenceOptions,
  isRunning,
  showSection,
  onToggle,
  onToggleStar,
  onToggleEssence,
  onMinLevelChange,
  onMaxLevelChange
}) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "collapsible-section", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "section-header", onClick: onToggle, children: [
      showSection ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { size: 16 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { size: 16 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Mission Filters" })
    ] }),
    showSection && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "section-content", style: { padding: "12px 16px" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { marginBottom: "10px" }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "filter-label", style: { marginBottom: "6px" }, children: "Difficulty:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "star-buttons", children: [1, 2, 3, 4, 5].map((star) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            className: `star-button ${filters.stars.includes(star) ? "active" : ""}`,
            onClick: () => onToggleStar(star),
            disabled: isRunning,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Star,
                {
                  size: 10,
                  fill: filters.stars.includes(star) ? "#eab308" : "none",
                  color: "#eab308"
                }
              ),
              star
            ]
          },
          star
        )) })
      ] }),
      essenceOptions.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { marginBottom: "10px" }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "filter-label", style: { marginBottom: "6px" }, children: "Target Essence:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "star-buttons", style: { flexWrap: "wrap" }, children: essenceOptions.map((option) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            className: `star-button ${filters.targetEssences?.includes(option.id) ? "active" : ""}`,
            onClick: () => onToggleEssence(option.id),
            disabled: isRunning,
            title: option.foodsCount ? `${option.foodsCount} food names mapped` : "No foods mapped yet — edit in Settings > Loot",
            style: { fontSize: "11px" },
            children: option.label
          },
          option.id
        )) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "filter-label", style: { marginBottom: "6px" }, children: "Level:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "level-inputs", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "number",
              min: "1",
              max: "340",
              value: filters.minLevel,
              onChange: (e) => onMinLevelChange(parseInt(e.target.value) || 1),
              disabled: isRunning,
              placeholder: "Min"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "-" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "number",
              min: "1",
              max: "340",
              value: filters.maxLevel,
              onChange: (e) => onMaxLevelChange(parseInt(e.target.value) || 340),
              disabled: isRunning,
              placeholder: "Max"
            }
          )
        ] })
      ] })
    ] })
  ] });
};
const StepByStepControls = ({
  showSection,
  onToggle,
  onNavigateToMission,
  onOpenIframe,
  onAutoPlay,
  onStopAutomation
}) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "collapsible-section", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "section-header", onClick: onToggle, children: [
      showSection ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { size: 16 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { size: 16 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Bug, { size: 14 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Step-by-Step Controls" })
    ] }),
    showSection && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "section-content", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "p",
        {
          style: {
            fontSize: "12px",
            color: "#a1a1aa",
            marginBottom: "12px"
          },
          children: "Test each automation step individually:"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "debug-button",
            onClick: onNavigateToMission,
            style: {
              width: "100%",
              textAlign: "left",
              padding: "10px 12px"
            },
            children: "1. Navigate to Next Mission"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "debug-button",
            onClick: onOpenIframe,
            style: {
              width: "100%",
              textAlign: "left",
              padding: "10px 12px"
            },
            children: "2. Open Dialog (Start Mission)"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "debug-button",
            onClick: onAutoPlay,
            style: {
              width: "100%",
              textAlign: "left",
              padding: "10px 12px"
            },
            children: "3. Auto Play Opened Mission"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "debug-button",
            onClick: onStopAutomation,
            style: {
              width: "100%",
              textAlign: "left",
              padding: "10px 12px",
              color: "#ef4444"
            },
            children: "Stop Automation"
          }
        )
      ] })
    ] })
  ] });
};
const DebugTools = ({
  showSection,
  onToggle,
  onViewLogs,
  onTestSelectors,
  onExportData
}) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "collapsible-section", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "section-header", onClick: onToggle, children: [
      showSection ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { size: 16 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { size: 16 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Wrench, { size: 14 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Debug Tools" })
    ] }),
    showSection && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "section-content", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "debug-grid", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "debug-button", onClick: onViewLogs, children: "View Logs" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "debug-button", onClick: onTestSelectors, children: "Test Selectors" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "debug-button", onClick: onExportData, children: "Export Data" })
    ] }) })
  ] });
};
const PopupApp = () => {
  const [isRunning, setIsRunning] = reactExports.useState(false);
  const [statusText, setStatusText] = reactExports.useState("Idle");
  const [currentMission, setCurrentMission] = reactExports.useState(null);
  const [stats, setStats] = reactExports.useState({
    queued: 0,
    total: 0,
    cleared: 0,
    uncleared: 0,
    todayCleared: 0
  });
  const [buildAge, setBuildAge] = reactExports.useState(getTimeSinceBuild());
  const [filters, setFilters] = reactExports.useState(null);
  const [showFilters, setShowFilters] = reactExports.useState(() => {
    const saved = localStorage.getItem("popup.showFilters");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [showStats, setShowStats] = reactExports.useState(() => {
    const saved = localStorage.getItem("popup.showStats");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [showDebug, setShowDebug] = reactExports.useState(() => {
    const saved = localStorage.getItem("popup.showDebug");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [showStepByStepControls, setShowStepByStepControls] = reactExports.useState(false);
  const [showStepControls, setShowStepControls] = reactExports.useState(() => {
    const saved = localStorage.getItem("popup.showStepControls");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [isInitialLoad, setIsInitialLoad] = reactExports.useState(true);
  const [debugMode, setDebugMode] = reactExports.useState(false);
  const [showNextMissions, setShowNextMissions] = reactExports.useState(true);
  const [nextMissionsCount, setNextMissionsCount] = reactExports.useState(5);
  const [nextMissions, setNextMissions] = reactExports.useState([]);
  const [essenceOptions, setEssenceOptions] = reactExports.useState([]);
  const [showNextMissionsSection, setShowNextMissionsSection] = reactExports.useState(() => {
    const saved = localStorage.getItem("popup.showNextMissionsSection");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const loadStats = reactExports.useCallback(async () => {
    try {
      const missionStats = await getMissionStats();
      setStats(missionStats);
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  }, []);
  const loadNextMissions = reactExports.useCallback(async () => {
    if (!showNextMissions) {
      setNextMissions([]);
      return;
    }
    try {
      const currentFilters = await getAutomationFilters();
      const missions = await getNextMissions(nextMissionsCount, currentFilters);
      setNextMissions(missions);
    } catch (error) {
      console.error("Failed to load next missions:", error);
    }
  }, [showNextMissions, nextMissionsCount]);
  const getStatusTextFromState = reactExports.useCallback((state, context, sessionActive) => {
    if (!state) return sessionActive ? "Running (session active)" : "Idle";
    switch (state) {
      case "idle":
      case "idleDialogOpen":
        return sessionActive ? "Running (session active)" : "Idle";
      case "starting":
        return "Starting...";
      case "waitingForGame":
        return "Waiting for game...";
      case "openingGame":
        return "Opening game...";
      case "gameReady":
      case "running":
        return context?.currentMissionId ? `Running (${context.currentMissionId})` : "Running";
      case "completing":
        return "Completing mission...";
      case "navigating":
        return "Navigating to next mission...";
      case "error":
        return context?.errorMessage ? `Error: ${context.errorMessage}` : "Error";
      default:
        return state;
    }
  }, []);
  const refreshBotStatus = reactExports.useCallback(() => {
    chrome.storage.local.get(["activeBotSession", "lazyfrogBotPresentationState"], (stored) => {
      chrome.runtime.sendMessage({ type: "PING" }, (resp) => {
        const state = resp?.state || stored?.lazyfrogBotPresentationState || "idle";
        const context = resp?.context || null;
        const sessionActive = !!stored?.activeBotSession;
        const running = !["idle", "error"].includes(state);
        setIsRunning(running);
        setCurrentMission(context?.currentMissionId || null);
        setStatusText(getStatusTextFromState(state, context, sessionActive));
      });
    });
  }, [getStatusTextFromState]);
  reactExports.useEffect(() => {
    loadStats();
    getAutomationFilters().then((loadedFilters) => {
      setFilters(normalizeAutomationFilters({
        ...loadedFilters,
        targetEssences: loadedFilters.targetEssences || []
      }));
      setIsInitialLoad(false);
    }).catch((error) => {
      console.error("Failed to load filters:", error);
      setIsInitialLoad(false);
    });
    getEssenceLootDictionary().then((dictionary) => {
      setEssenceOptions(getEssenceFilterOptions(dictionary));
    }).catch((error) => {
      console.error("Failed to load essence dictionary:", error);
    });
    chrome.storage.local.get(["automationConfig"], (result) => {
      if (result.automationConfig) {
        setShowStepByStepControls(result.automationConfig.showStepByStepControls || false);
        setShowNextMissions(result.automationConfig.showNextMissions !== false);
        setNextMissionsCount(result.automationConfig.nextMissionsCount || 5);
        setDebugMode(result.automationConfig.debugMode || false);
      }
    });
    const interval = setInterval(() => {
      setBuildAge(getTimeSinceBuild());
    }, 6e4);
    refreshBotStatus();
    return () => clearInterval(interval);
  }, [loadStats, refreshBotStatus]);
  reactExports.useEffect(() => {
    localStorage.setItem("popup.showFilters", JSON.stringify(showFilters));
  }, [showFilters]);
  reactExports.useEffect(() => {
    localStorage.setItem("popup.showStats", JSON.stringify(showStats));
  }, [showStats]);
  reactExports.useEffect(() => {
    localStorage.setItem("popup.showDebug", JSON.stringify(showDebug));
  }, [showDebug]);
  reactExports.useEffect(() => {
    localStorage.setItem("popup.showStepControls", JSON.stringify(showStepControls));
  }, [showStepControls]);
  reactExports.useEffect(() => {
    localStorage.setItem("popup.showNextMissionsSection", JSON.stringify(showNextMissionsSection));
  }, [showNextMissionsSection]);
  reactExports.useEffect(() => {
    loadNextMissions();
  }, [loadNextMissions]);
  reactExports.useEffect(() => {
    if (isInitialLoad || !filters) {
      return;
    }
    chrome.storage.local.set({
      automationFilters: normalizeAutomationFilters(filters)
    });
    chrome.runtime.sendMessage({ type: "REFRESH_BOT_QUEUE" }).catch(() => {
    });
    loadStats();
    loadNextMissions();
  }, [filters, isInitialLoad, loadStats, loadNextMissions]);
  reactExports.useEffect(() => {
    const messageListener = (message) => {
      if (message.type === "STATE_CHANGED") {
        chrome.storage.local.get(["activeBotSession"], (stored) => {
          const sessionActive = !!stored?.activeBotSession;
          const state = message.state || "idle";
          setIsRunning(!["idle", "error"].includes(state));
          setCurrentMission(message.context?.currentMissionId || null);
          setStatusText(getStatusTextFromState(state, message.context || null, sessionActive));
        });
        loadStats();
      } else if (message.type === "MISSIONS_CHANGED" || message.type === "MISSIONS_UPDATED") {
        loadStats();
        loadNextMissions();
      } else if (message.type === "BOT_QUEUE_UPDATED") {
        loadStats();
        loadNextMissions();
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    const statusPoll = setInterval(refreshBotStatus, 2e3);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      clearInterval(statusPoll);
    };
  }, [loadStats, loadNextMissions, refreshBotStatus, getStatusTextFromState]);
  const handleStart = () => {
    chrome.runtime.sendMessage({
      type: "START_BOT"
    });
  };
  const toggleStar = (star) => {
    setFilters((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        stars: prev.stars.includes(star) ? prev.stars.filter((s) => s !== star) : [...prev.stars, star].sort()
      };
    });
  };
  const toggleEssence = (essenceId) => {
    setFilters((prev) => {
      if (!prev) return prev;
      const current = prev.targetEssences || [];
      return {
        ...prev,
        targetEssences: current.includes(essenceId) ? current.filter((id) => id !== essenceId) : [...current, essenceId]
      };
    });
  };
  const handleStop = () => {
    chrome.runtime.sendMessage({ type: "STOP_BOT" });
  };
  const viewLogs = () => {
    window.open("http://localhost:7856/logs", "_blank");
  };
  const testSelectors = async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: "TEST_SELECTORS" });
    }
  };
  const exportData = async () => {
    try {
      const { exportAllData } = await __vitePreload(async () => {
        const { exportAllData: exportAllData2 } = await import("./exportAllData-DpxCAw9X.js");
        return { exportAllData: exportAllData2 };
      }, true ? __vite__mapDeps([0,1]) : void 0);
      await exportAllData();
    } catch (error) {
      alert("Failed to export data: " + error);
    }
  };
  const openSettings = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
  };
  const handleNavigateToMission = () => {
    if (!filters) return;
    chrome.runtime.sendMessage({
      type: "NAVIGATE_TO_MISSION",
      filters
    });
  };
  const handleOpenIframe = () => {
    chrome.runtime.sendMessage({
      type: "OPEN_MISSION_IFRAME"
    });
  };
  const handleAutoPlay = () => {
    chrome.runtime.sendMessage({
      type: "START_MISSION_AUTOMATION"
    });
  };
  const handleStopAutomation = () => {
    chrome.runtime.sendMessage({
      type: "STOP_MISSION_AUTOMATION"
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "popup-container", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "status-section", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "status-header", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "status-text", children: "LazyFrog Bot" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `status-dot ${isRunning ? "running" : "idle"}` })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "status-details", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "status-line", children: [
          "Status: ",
          statusText
        ] }),
        currentMission && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "status-line", children: [
          "Mission: ",
          currentMission
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "control-section", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "control-button start-button", onClick: handleStart, disabled: isRunning, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Play, { size: 16 }),
        "START (",
        stats.queued,
        ")"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "control-button stop-button", onClick: handleStop, disabled: !isRunning, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Pause, { size: 16 }),
        "STOP"
      ] })
    ] }),
    showStepByStepControls && /* @__PURE__ */ jsxRuntimeExports.jsx(
      StepByStepControls,
      {
        showSection: showStepControls,
        onToggle: () => setShowStepControls(!showStepControls),
        onNavigateToMission: handleNavigateToMission,
        onOpenIframe: handleOpenIframe,
        onAutoPlay: handleAutoPlay,
        onStopAutomation: handleStopAutomation
      }
    ),
    filters && /* @__PURE__ */ jsxRuntimeExports.jsx(
      MissionFilters,
      {
        filters,
        essenceOptions,
        isRunning,
        showSection: showFilters,
        onToggle: () => setShowFilters(!showFilters),
        onToggleStar: toggleStar,
        onToggleEssence: toggleEssence,
        onMinLevelChange: (level) => setFilters((prev) => prev ? { ...prev, minLevel: level } : prev),
        onMaxLevelChange: (level) => setFilters((prev) => prev ? { ...prev, maxLevel: level } : prev)
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(MissionStats, { stats }),
    showNextMissions && /* @__PURE__ */ jsxRuntimeExports.jsx(
      NextMissions,
      {
        nextMissions,
        showSection: showNextMissionsSection,
        onToggle: () => setShowNextMissionsSection(!showNextMissionsSection)
      }
    ),
    debugMode && /* @__PURE__ */ jsxRuntimeExports.jsx(
      DebugTools,
      {
        showSection: showDebug,
        onToggle: () => setShowDebug(!showDebug),
        onViewLogs: viewLogs,
        onTestSelectors: testSelectors,
        onExportData: exportData
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "settings-button", onClick: openSettings, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Settings, { size: 20 }),
      "MORE"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "footer", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "v",
        VERSION
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "a",
        {
          href: "https://github.com/sponsors/Saturate",
          target: "_blank",
          rel: "noopener noreferrer",
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            color: "#ec4899",
            fontSize: "12px",
            textDecoration: "none",
            padding: "6px 12px",
            borderRadius: "6px",
            transition: "background-color 0.2s"
          },
          onMouseEnter: (e) => {
            e.currentTarget.style.backgroundColor = "rgba(236, 72, 153, 0.1)";
          },
          onMouseLeave: (e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Heart, { size: 12, fill: "#ec4899" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Support" })
          ]
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "Built: ",
        buildAge
      ] })
    ] })
  ] });
};
const container = document.getElementById("root");
if (container) {
  const root = clientExports.createRoot(container);
  root.render(/* @__PURE__ */ jsxRuntimeExports.jsx(PopupApp, {}));
}
