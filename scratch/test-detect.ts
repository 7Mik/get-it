import { config } from "dotenv";
config();

import { detectConceptsForPages } from "../lib/agents/detect";

const pages = [
  {
    pageIndex: 1,
    text: "The heart is a muscular organ in most animals, which pumps blood through the blood vessels of the circulatory system. The pumped blood carries oxygen and nutrients to the body, while carrying metabolic waste such as carbon dioxide to the lungs.",
  },
];

async function main() {
  try {
    const res = await detectConceptsForPages(pages);
    console.log("Success:", JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
