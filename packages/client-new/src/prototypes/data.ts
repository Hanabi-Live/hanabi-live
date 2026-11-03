export interface Direction {
  id: string;
  name: string;
  summary: string;
  character: string;
  colors: readonly string[];
  layout: "rows" | "cards" | "social" | "detail" | "felt" | "featured";
}

export const directions: readonly Direction[] = [
  {
    id: "clubhouse",
    name: "Clubhouse",
    summary:
      "A warm, welcoming games club. Editorial type, cherry-red details, and a generous, easy-to-scan room list.",
    character: "Warm / sociable / editorial",
    colors: ["#f7f3eb", "#b33430", "#292722"],
    layout: "rows",
  },
  {
    id: "night-shift",
    name: "Night Shift",
    summary:
      "Built for regulars and long sessions. A compact dark workspace with permanent navigation and chat.",
    character: "Dark / focused / information-dense",
    colors: ["#171922", "#c5b8fa", "#ebedf5"],
    layout: "rows",
  },
  {
    id: "paper",
    name: "Paper & Ink",
    summary:
      "The clarity of a printed games journal. Strong rules, serif headlines, and a two-column room directory.",
    character: "Literary / high-contrast / structured",
    colors: ["#fffdf6", "#22221f", "#b53e2d"],
    layout: "cards",
  },
  {
    id: "garden",
    name: "Garden Room",
    summary:
      "A quiet place to think together. Soft green surfaces, rounded rooms, and an unobtrusive icon rail.",
    character: "Calm / soft / spacious",
    colors: ["#eaf0e7", "#285342", "#fffef7"],
    layout: "cards",
  },
  {
    id: "signal",
    name: "Signal",
    summary:
      "A crisp, graphic directory. Cobalt navigation, square controls, aligned columns, and community below.",
    character: "Precise / graphic / direct",
    colors: ["#f3f5fa", "#244bc2", "#17202d"],
    layout: "rows",
  },
  {
    id: "arcade",
    name: "After Hours",
    summary:
      "A playful late-night game room. Warm amber, plum surfaces, and a featured table with illustrated cards.",
    character: "Playful / expressive / energetic",
    colors: ["#292039", "#ffca76", "#f5eafa"],
    layout: "featured",
  },
  {
    id: "social",
    name: "Good Company",
    summary:
      "People first, games second. Friends on the left, conversation in the center, open seats on the right.",
    character: "Conversational / friendly / community-first",
    colors: ["#f4f0fa", "#684899", "#f4d5bf"],
    layout: "social",
  },
  {
    id: "orbit",
    name: "Orbit",
    summary:
      "Select, inspect, then join. A master-detail workspace with a room list and a persistent table preview.",
    character: "Quiet / systematic / practical",
    colors: ["#edf2f7", "#205b81", "#ffffff"],
    layout: "detail",
  },
  {
    id: "felt",
    name: "The Card Table",
    summary:
      "Bring the physical game online. Deep green felt, ivory cards, and seats arranged around a shared table.",
    character: "Tactile / game-centered / immersive",
    colors: ["#143d34", "#e5cc9b", "#f9f3e5"],
    layout: "felt",
  },
  {
    id: "mono",
    name: "Just Play",
    summary:
      "Only what you came for. A restrained, almost monochrome lobby with a wide list and optional conversation.",
    character: "Minimal / light / distraction-free",
    colors: ["#ffffff", "#202020", "#eeeeee"],
    layout: "rows",
  },
];

export interface SampleTable {
  id: number;
  name: string;
  variant: string;
  players: readonly string[];
  seats: number;
  pace: string;
  playing: boolean;
  friend: boolean;
}

export const sampleTables: readonly SampleTable[] = [
  {
    id: 1,
    name: "The usual suspects",
    variant: "No Variant",
    players: ["Riley", "Sam"],
    seats: 4,
    pace: "Untimed",
    playing: false,
    friend: true,
  },
  {
    id: 2,
    name: "First game? Welcome!",
    variant: "No Variant",
    players: ["Jules"],
    seats: 3,
    pace: "Untimed",
    playing: false,
    friend: false,
  },
  {
    id: 3,
    name: "A little rainbow practice",
    variant: "Rainbow (5 Suits)",
    players: ["Noor", "Alex", "Kit"],
    seats: 4,
    pace: "4m + 20s",
    playing: false,
    friend: false,
  },
  {
    id: 4,
    name: "One more before dinner",
    variant: "6 Suits",
    players: ["Morgan", "Robin"],
    seats: 3,
    pace: "Untimed",
    playing: false,
    friend: true,
  },
  {
    id: 5,
    name: "Quiet concentration",
    variant: "No Variant",
    players: ["Ari", "Lee", "Jamie", "Drew"],
    seats: 4,
    pace: "Untimed",
    playing: true,
    friend: false,
  },
];

export const people = [
  { name: "Riley", note: "Waiting at a table", initial: "R", color: "rose" },
  { name: "Sam", note: "Ready for a game", initial: "S", color: "blue" },
  { name: "Morgan", note: "Playing 6 Suits", initial: "M", color: "gold" },
  {
    name: "Jules",
    note: "Welcoming new players",
    initial: "J",
    color: "green",
  },
] as const;

export const initialMessages = [
  {
    who: "Riley",
    text: "Anyone up for a relaxed four-player game?",
    time: "18:04",
  },
  { who: "Sam", text: "Absolutely. Just making a cup of tea.", time: "18:05" },
  {
    who: "Jules",
    text: "I've opened a beginner table. All welcome!",
    time: "18:06",
  },
  {
    who: "Noor",
    text: "That last rainbow finish was so satisfying.",
    time: "18:07",
  },
];
