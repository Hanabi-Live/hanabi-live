// Central point for all game tooltips

// Tooltipster is a jQuery library, so we import it purely for the side-effects
// (e.g. so that it can add the ".tooltipster" property to the "$" object)
// webpack will purge modules like this from the resulting bundled file (e.g. the "tree shaking"
// feature) if we have "sideEffects" equal to true in the "package.json" file
// So we have to make sure that "sideEffects" is is either removed or set to false
// Tree shaking only makes a difference of 2 KB in the resulting bundled file, so we do not have
// to worry about that for now
import "tooltipster";
// ScrollableTip is a Tooltipster library that allows for a scrolling tooltip
// We import it for the side-effects for the same reason
import "../lib/tooltipster-scrollableTip.min";

// Constants
const maxPlayers = 6;
const maxCardsInADeck = 60;
const tooltipThemes = ["tooltipster-shadow", "tooltipster-shadow-big"];

// Tooltip options
const options: JQueryTooltipster.ITooltipsterOptions = {
  animation: "grow",
  contentAsHTML: true,
  delay: 0,
  theme: tooltipThemes,
};
const historyOptions: JQueryTooltipster.ITooltipsterOptions = {
  animation: "grow",
  contentAsHTML: true,
  delay: 0,
  theme: ["tooltipster-shadow", "tooltipster-shadow-big"],
};
const navOptions: JQueryTooltipster.ITooltipsterOptions = {
  theme: "tooltipster-shadow",
  trigger: "click",
  interactive: true,
  delay: 0,
  // Some tooltips are too large for small resolutions and will wrap off the screen;
  // we can use a Tooltipster plugin to automatically create a scroll bar for it
  // https://github.com/louisameline/tooltipster-scrollableTip
  plugins: [
    "sideTip", // Make it have the ability to be positioned on a specific side
    "scrollableTip", // Make it scrollable
  ],
  functionBefore: (): void => {},
};

export const TOOLTIP_DELAY = 500; // In milliseconds

// Initialize in-game tooltips (for notes, etc.)
export function initGame(): void {
  const gameOptions: JQueryTooltipster.ITooltipsterOptions = {
    ...options,
    interactive: true, // So that users can update their notes
    trigger: "custom",
    updateAnimation: null,
  };

  // Initialize some basic tooltips
  const tooltips = [
    "chat",
    "deck",
    "discard",
    "efficiency-text",
    "efficiency-number",
    "hypo-back",
    "hypo-edit-cards",
    "hypo-show-drawn",
    "kill",
    "leader",
    "lobby",
    "lobby-small",
    "time-taken",
    "pace",
    "replay",
    "restart",
    "spectators",
    "strikes",
    "turn-number",
  ];
  for (const tooltip of tooltips) {
    $("#game-tooltips").append(`<div id="tooltip-${tooltip}"></div>`);
    $(`#tooltip-${tooltip}`).tooltipster(gameOptions);
  }

  // The "time-taken" tooltip should have centered text
  const newThemes = tooltipThemes.slice();
  newThemes.push("align-center");
  $("#tooltip-time-taken").tooltipster("instance").option("theme", newThemes);

  // Dynamically create the player tooltips
  for (let i = 0; i < maxPlayers; i++) {
    $("#game-tooltips").append(`<div id="tooltip-player-${i}"></div>`);
    $(`#tooltip-player-${i}`).tooltipster(gameOptions);
    $(`#tooltip-player-${i}`)
      .tooltipster("instance")
      .option("theme", newThemes);

    $("#game-tooltips").append(
      `<div id="tooltip-character-assignment-${i}"></div>`,
    );
    $(`#tooltip-character-assignment-${i}`).tooltipster(gameOptions);
    $(`#tooltip-character-assignment-${i}`)
      .tooltipster("instance")
      .option("theme", newThemes);
  }

  // Dynamically create the card note tooltips
  for (let i = 0; i < maxCardsInADeck + 6; i++) {
    // The number in the id matches the order of the card in the deck
    // We add 6 because we also need note tooltips for the stack bases
    $("#game-tooltips").append(`<div id="tooltip-card-${i}"></div>`);
    $(`#tooltip-card-${i}`).tooltipster(gameOptions);
  }
}

export function create(
  selector: string | JQuery<HTMLElement>,
  type:
    | JQueryTooltipster.ITooltipsterOptions
    | "default"
    | "history"
    | "nav" = "history",
  args?: unknown,
): void {
  const tooltip = typeof selector === "string" ? $(selector) : selector;
  const customType = typeof type === "string" ? getOptionsFromType(type) : type;
  const tooltipOptions = {
    ...customType,
    args,
  };
  tooltip.tooltipster(tooltipOptions);
}

export function open(selector: string | JQuery<HTMLElement>): void {
  const tooltip = typeof selector === "string" ? $(selector) : selector;
  tooltip.tooltipster("open");
}

export function openInstance(selector: string | JQuery<HTMLElement>): void {
  const tooltip = typeof selector === "string" ? $(selector) : selector;
  tooltip.tooltipster("instance").close();
}

export function close(selector: string | JQuery<HTMLElement>): void {
  const tooltip = typeof selector === "string" ? $(selector) : selector;
  tooltip.tooltipster("close");
}

export function closeInstance(selector: string | JQuery<HTMLElement>): void {
  const tooltip = typeof selector === "string" ? $(selector) : selector;
  tooltip.tooltipster("instance").close();
}

// From: https://stackoverflow.com/questions/27709489/jquery-tooltipster-plugin-hide-all-tips
export function closeAllTooltips(): void {
  const instances = $.tooltipster.instances();
  $.each(
    instances,
    (_: number, instance: JQueryTooltipster.ITooltipsterInstance) => {
      if (instance.status().open) {
        instance.close();
      }
    },
  );
}

export function setInstanceContent(
  selector: string | JQuery<HTMLElement>,
  content: string,
): void {
  const tooltip = typeof selector === "string" ? $(selector) : selector;
  tooltip.tooltipster("instance").content(content);
}

export function setPosition(
  selector: string | JQuery<HTMLElement>,
  x: number,
  y: number,
): void {
  const tooltip = typeof selector === "string" ? $(selector) : selector;
  tooltip.css("left", x).css("top", y);
}

export function setOption(
  selector: string | JQuery<HTMLElement>,
  option: string,
  value: unknown,
): void {
  const tooltip = typeof selector === "string" ? $(selector) : selector;
  tooltip.tooltipster("option", option, value);
}

export function setInstanceOption(
  selector: string | JQuery<HTMLElement>,
  option: string,
  value: string,
): void {
  const tooltip = typeof selector === "string" ? $(selector) : selector;
  tooltip.tooltipster("instance").option(option, value);
}

export function getStatus(
  selector: string | JQuery<HTMLElement>,
): JQueryTooltipster.ITooltipStatus {
  const tooltip = typeof selector === "string" ? $(selector) : selector;
  return tooltip.tooltipster("status");
}

export function getInstance(
  selector: string | JQuery<HTMLElement>,
): JQueryTooltipster.ITooltipsterInstance {
  const tooltip = typeof selector === "string" ? $(selector) : selector;
  return tooltip.tooltipster("instance");
}

export function reposition(selector: string | JQuery<HTMLElement>): void {
  const tooltip = typeof selector === "string" ? $(selector) : selector;
  tooltip.tooltipster("reposition");
}

export function isOpen(selector: string | JQuery<HTMLElement>): boolean {
  const tooltip = typeof selector === "string" ? $(selector) : selector;
  return tooltip.tooltipster("status").open;
}

function getOptionsFromType(
  type: "default" | "history" | "nav" = "history",
): JQueryTooltipster.ITooltipsterOptions {
  switch (type) {
    case "history":
      return historyOptions;
    case "nav":
      return navOptions;
    default:
      return options;
  }
}
