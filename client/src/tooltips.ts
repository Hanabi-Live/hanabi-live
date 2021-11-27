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

export const TOOLTIP_DELAY = 500; // In milliseconds

// Constants
const MAX_PLAYERS = 6;
const MAX_CARDS_IN_A_DECK = 60;
const TOOLTIP_THEME = ["tooltipster-shadow", "tooltipster-shadow-big"];
const TOOLTIP_THEME_CENTERED = [
  "tooltipster-shadow",
  "tooltipster-shadow-big",
  "align-center",
];

// Tooltip options
const defaultOptions: JQueryTooltipster.ITooltipsterOptions = {
  animation: "grow",
  contentAsHTML: true,
  delay: 0,
  theme: TOOLTIP_THEME,
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
const gameOptions: JQueryTooltipster.ITooltipsterOptions = {
  ...defaultOptions,
  interactive: true, // So that users can update their notes
  trigger: "custom",
  updateAnimation: null,
};
const clipboardOptions: JQueryTooltipster.ITooltipsterOptions = {
  animation: "grow",
  content: '<span style="font-size: 0.75em;">URL copied to clipboard!</span>',
  contentAsHTML: true,
  delay: 0,
  trigger: "custom",
  theme: ["tooltipster-shadow", "tooltipster-shadow-big"],
};

type TooltipOptionType = "clipboard" | "default" | "nav";

// Initialize in-game tooltips (for notes, etc.)
export function initGame(): void {
  createGameTooltips();
  createPlayerTooltips();
  createCardTooltips();
}

export function create(
  selector: string,
  type: JQueryTooltipster.ITooltipsterOptions | TooltipOptionType = "default",
  args?: unknown,
): void {
  const tooltip = getElementFromSelector(selector);
  const customType = typeof type === "string" ? getOptionsFromType(type) : type;
  const tooltipOptions = {
    ...customType,
    args,
  };
  // Create the tooltip only once
  // https://stackoverflow.com/a/40916543/180243
  if ($.tooltipster.instances($(tooltip)).length === 0) {
    tooltip.tooltipster(tooltipOptions);
  }
}

export function open(selector: string): void {
  const tooltip = getElementFromSelector(selector);
  if (isTooltipster(tooltip)) {
    tooltip.tooltipster("open");
  }
}

export function openInstance(selector: string): void {
  const tooltip = getElementFromSelector(selector);
  if (isTooltipster(tooltip)) {
    tooltip.tooltipster("instance").open();
  }
}

export function close(selector: string): void {
  const tooltip = getElementFromSelector(selector);
  if (isTooltipster(tooltip)) {
    tooltip.tooltipster("close");
  }
}

export function closeInstance(selector: string): void {
  const tooltip = getElementFromSelector(selector);
  if (isTooltipster(tooltip)) {
    tooltip.tooltipster("instance").close();
  }
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

export function setInstanceContent(selector: string, content: string): void {
  const tooltip = getElementFromSelector(selector);
  if (isTooltipster(tooltip)) {
    tooltip.tooltipster("instance").content(content);
  }
}

export function setPosition(selector: string, x: number, y: number): void {
  const tooltip = getElementFromSelector(selector);
  tooltip.css("left", x).css("top", y);
}

export function setOption(
  selector: string,
  option: string,
  value: unknown,
): void {
  const tooltip = getElementFromSelector(selector);
  if (isTooltipster(tooltip)) {
    tooltip.tooltipster("option", option, value);
  }
}

export function setInstanceOption(
  selector: string,
  option: string,
  value: string | string[],
): void {
  const tooltip = getElementFromSelector(selector);
  if (isTooltipster(tooltip)) {
    tooltip.tooltipster("instance").option(option, value);
  }
}

export function getStatus(selector: string): JQueryTooltipster.ITooltipStatus {
  const tooltip = getElementFromSelector(selector);
  if (isTooltipster(tooltip)) {
    return tooltip.tooltipster("status");
  }
  return {
    destroyed: true,
    destroying: false,
    enabled: false,
    /** if the tooltip is open (either appearing, stable or disappearing) */
    open: false,
    /** the state equals one of these four values: */
    state: "closed",
  };
}

export function getInstance(
  selector: string,
): JQueryTooltipster.ITooltipsterInstance | null {
  const tooltip = getElementFromSelector(selector);
  if (isTooltipster(tooltip)) {
    return tooltip.tooltipster("instance");
  }
  return null;
}

export function reposition(selector: string): void {
  const tooltip = getElementFromSelector(selector);
  if (isTooltipster(tooltip)) {
    tooltip.tooltipster("reposition");
  }
}

export function isOpen(selector: string): boolean {
  const tooltip = getElementFromSelector(selector);
  if (isTooltipster(tooltip)) {
    return tooltip.tooltipster("status").open;
  }
  return false;
}

function getOptionsFromType(
  type: TooltipOptionType = "default",
): JQueryTooltipster.ITooltipsterOptions {
  switch (type) {
    case "clipboard":
      return clipboardOptions;
    case "nav":
      return navOptions;
    default:
      return defaultOptions;
  }
}

function appendDiv(selector: string, id: string): void {
  const element = document.createElement("div");
  element.setAttribute("id", id);
  document.querySelector(selector)?.appendChild(element);
}

function createGameTooltips(): void {
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
    const id = `tooltip-${tooltip}`;
    appendDiv("#game-tooltips", id);
    create(`#${id}`, gameOptions);
  }

  // The "time-taken" tooltip should have centered text
  setInstanceOption("#tooltip-time-taken", "theme", TOOLTIP_THEME_CENTERED);
}

function createPlayerTooltips(): void {
  // Dynamically create the player tooltips
  for (let i = 0; i < MAX_PLAYERS; i++) {
    let id = `tooltip-player-${i}`;
    appendDiv("#game-tooltips", id);
    create(`#${id}`, gameOptions);
    setInstanceOption(`#${id}`, "theme", TOOLTIP_THEME_CENTERED);

    id = `tooltip-character-assignment-${i}`;
    appendDiv("#game-tooltips", id);
    create(`#${id}`, gameOptions);
    setInstanceOption(`#${id}`, "theme", TOOLTIP_THEME_CENTERED);
  }
}

function createCardTooltips(): void {
  // Dynamically create the card note tooltips
  for (let i = 0; i < MAX_CARDS_IN_A_DECK + 6; i++) {
    // The number in the id matches the order of the card in the deck
    // We add 6 because we also need note tooltips for the stack bases
    const id = `tooltip-card-${i}`;
    appendDiv("#game-tooltips", id);
    create(`#${id}`, gameOptions);
  }
}

function getElementFromSelector(selector: string): JQuery<HTMLElement> {
  return typeof selector === "string" ? $(selector) : selector;
}

function isTooltipster(element: JQuery<HTMLElement>): boolean {
  return element.hasClass("tooltipstered");
}
