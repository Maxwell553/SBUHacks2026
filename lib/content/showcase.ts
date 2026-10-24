/**
 * Landing-page sample reel. Uses the example model definitions and the same
 * renderer as generated videos, so visitors see the real pipeline output.
 */
import {
  EXAMPLE_BROADLEAF_TREE,
  EXAMPLE_CAMPFIRE,
  EXAMPLE_COG_SHIP,
  EXAMPLE_FOOT_SOLDIER,
  EXAMPLE_STONE_KEEP,
} from "@/lib/content/model-examples";
import type { VideoScript } from "@/lib/schema/video";

const NORMAN = "#3f5fa8";
const SAXON = "#b5523b";

export const SHOWCASE_SCRIPT: VideoScript = {
  version: 2,
  title: "The Norman Conquest",
  subtitle: "How one autumn rewrote England",
  dateLabel: "1066",
  location: "Sussex, England",
  coordinates: { lat: 50.91, lon: 0.49 },
  totalDuration: 30,
  seed: 1066,
  palette: { primary: "#a64f35", secondary: "#246d62", accent: "#c99a3c" },
  factions: [
    { name: "Normans", color: NORMAN },
    { name: "Anglo-Saxons", color: SAXON },
  ],
  models: [EXAMPLE_FOOT_SOLDIER, EXAMPLE_COG_SHIP, EXAMPLE_BROADLEAF_TREE, EXAMPLE_CAMPFIRE, EXAMPLE_STONE_KEEP],
  scenes: [
    {
      kind: "map",
      duration: 5,
      kicker: "Sept 27, 1066",
      caption: "William of Normandy's fleet slips across the Channel from Saint-Valery towards the Sussex coast.",
      setting: "ocean",
      timeOfDay: "day",
      weather: "clear",
      camera: "push_in",
      elements: [],
      map: {
        lat: 50.82,
        lon: 0.33,
        label: "Pevensey",
        zoom: "region",
        route: [
          { lat: 50.18, lon: 1.63 },
          { lat: 50.45, lon: 1.0 },
          { lat: 50.82, lon: 0.33 },
        ],
      },
    },
    {
      kind: "diorama",
      duration: 6,
      kicker: "Sept 28 · Pevensey Bay",
      caption: "Around 7,000 men, horses and supplies come ashore unopposed while Harold is still in the north.",
      setting: "coast",
      timeOfDay: "dawn",
      weather: "clear",
      camera: "pan_right",
      elements: [
        {
          model: "cog_ship",
          count: 4,
          formation: "line",
          position: "back",
          motion: "sail",
          facing: "left",
          color: NORMAN,
          label: "Norman fleet",
        },
        {
          model: "foot_soldier",
          count: 12,
          formation: "column",
          position: "front_left",
          motion: "march",
          facing: "left",
          color: NORMAN,
        },
        { model: "broadleaf_tree", count: 7, formation: "scatter", position: "left", motion: "sway" },
      ],
    },
    {
      kind: "diorama",
      duration: 7,
      kicker: "Oct 14, 1066 · Senlac Hill",
      caption: "Harold II's shield wall holds the ridge for hours against wave after wave of Norman attacks.",
      setting: "hills",
      timeOfDay: "day",
      weather: "cloudy",
      camera: "orbit",
      elements: [
        {
          model: "foot_soldier",
          count: 30,
          formation: "block",
          position: "left",
          motion: "charge",
          facing: "right",
          color: NORMAN,
          label: "Norman army",
        },
        {
          model: "foot_soldier",
          count: 30,
          formation: "block",
          position: "right",
          motion: "idle",
          facing: "left",
          color: SAXON,
          label: "Saxon shield wall",
        },
        { model: "broadleaf_tree", count: 6, formation: "scatter", position: "back", motion: "sway" },
      ],
    },
    {
      kind: "diorama",
      duration: 6,
      kicker: "Dusk · Battle Abbey site",
      caption: "Harold falls late in the day; the English line breaks and the battle is lost.",
      setting: "battlefield",
      timeOfDay: "dusk",
      weather: "smoke",
      camera: "push_in",
      elements: [
        { model: "campfire", count: 4, formation: "scatter", position: "center", motion: "burn" },
        { model: "foot_soldier", count: 14, formation: "scatter", position: "center", motion: "idle", color: NORMAN },
        { model: "broadleaf_tree", count: 5, formation: "scatter", position: "back_right", motion: "sway" },
      ],
    },
    {
      kind: "diorama",
      duration: 6,
      kicker: "Dec 25, 1066 · London",
      caption:
        "William is crowned King of England on Christmas Day, and Norman stone castles soon rise across the land.",
      setting: "snow",
      timeOfDay: "night",
      weather: "snow",
      camera: "crane_up",
      elements: [
        { model: "stone_keep", count: 1, formation: "single", position: "center", motion: "idle", color: NORMAN },
        {
          model: "foot_soldier",
          count: 10,
          formation: "column",
          position: "front",
          motion: "march",
          facing: "right",
          color: NORMAN,
        },
        { model: "broadleaf_tree", count: 6, formation: "scatter", position: "back_left", motion: "sway" },
      ],
    },
  ],
};
