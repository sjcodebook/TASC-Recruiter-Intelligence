import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(currentDir, "../docs/TASC_SYSTEM_DEMO.excalidraw");
const updated = 1_724_000_000_000;
let order = 0;

const frames = [];
const connectors = [];
const shapes = [];
const texts = [];

const palette = {
  ink: "#14222b",
  muted: "#52616b",
  teal: "#008f7a",
  tealFill: "#d9f3ee",
  blue: "#1971c2",
  blueFill: "#dbeafe",
  orange: "#d97706",
  orangeFill: "#ffedd5",
  purple: "#7048e8",
  purpleFill: "#ede9fe",
  cream: "#fffaf0",
  grayFill: "#eef1f3",
  white: "#ffffff"
};

function index() {
  order += 1;
  return `a${String(order).padStart(4, "0")}`;
}

function seedFor(id) {
  return [...id].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 17);
}

function base(id, type, x, y, width, height, frameId, options = {}) {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: options.strokeColor ?? palette.ink,
    backgroundColor: options.backgroundColor ?? "transparent",
    fillStyle: "solid",
    strokeWidth: options.strokeWidth ?? 2,
    strokeStyle: options.strokeStyle ?? "solid",
    roughness: options.roughness ?? 1,
    opacity: 100,
    groupIds: options.groupIds ?? [],
    frameId: frameId ?? null,
    index: index(),
    roundness: options.roundness ?? (type === "rectangle" ? { type: 3 } : null),
    seed: seedFor(id),
    version: 1,
    versionNonce: seedFor(`${id}-version`),
    isDeleted: false,
    boundElements: [],
    updated,
    link: null,
    locked: false
  };
}

function addFrame(id, x, y, width, height, name) {
  frames.push({
    ...base(id, "frame", x, y, width, height, null, {
      strokeColor: "#adb5bd",
      strokeWidth: 1,
      roughness: 0,
      roundness: null
    }),
    name
  });
}

function addText(id, frameId, x, y, width, text, fontSize = 18, color = palette.ink, align = "left") {
  const lines = text.split("\n").length;
  texts.push({
    ...base(id, "text", x, y, width, Math.ceil(lines * fontSize * 1.25), frameId, {
      strokeColor: color,
      strokeWidth: 1,
      roughness: 0,
      roundness: null
    }),
    fontSize,
    fontFamily: 1,
    text,
    rawText: text,
    textAlign: align,
    verticalAlign: "top",
    containerId: null,
    originalText: text,
    autoResize: false,
    lineHeight: 1.25
  });
}

function addCard(id, frameId, x, y, width, height, title, body, options = {}) {
  const groupIds = [id];
  shapes.push(base(id, "rectangle", x, y, width, height, frameId, {
    strokeColor: options.strokeColor ?? palette.ink,
    backgroundColor: options.backgroundColor ?? palette.white,
    strokeWidth: options.strokeWidth ?? 2,
    roughness: options.roughness ?? 1,
    groupIds
  }));
  addText(`${id}-title`, frameId, x + 16, y + 14, width - 32, title, options.titleSize ?? 20,
    options.titleColor ?? options.strokeColor ?? palette.ink, options.align ?? "left");
  if (body) {
    addText(`${id}-body`, frameId, x + 16, y + (options.bodyTop ?? 52), width - 32, body,
      options.bodySize ?? 16, options.bodyColor ?? palette.muted, options.align ?? "left");
  }
}

function addPill(id, frameId, x, y, width, height, text, backgroundColor, strokeColor, fontSize = 18) {
  shapes.push(base(id, "rectangle", x, y, width, height, frameId, {
    strokeColor,
    backgroundColor,
    roughness: 1,
    groupIds: [id]
  }));
  const textHeight = Math.ceil(fontSize * 1.25);
  addText(`${id}-text`, frameId, x + 10, y + ((height - textHeight) / 2), width - 20, text, fontSize, strokeColor, "center");
}

function addDiamond(id, frameId, x, y, width, height, text) {
  shapes.push(base(id, "diamond", x, y, width, height, frameId, {
    strokeColor: palette.orange,
    backgroundColor: palette.orangeFill,
    roughness: 1,
    roundness: null,
    groupIds: [id]
  }));
  addText(`${id}-text`, frameId, x + 25, y + 40, width - 50, text, 18, palette.ink, "center");
}

function addArrow(id, frameId, x, y, points, options = {}) {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  connectors.push({
    ...base(id, "arrow", x, y, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), frameId, {
      strokeColor: options.strokeColor ?? palette.ink,
      strokeWidth: options.strokeWidth ?? 2,
      strokeStyle: options.strokeStyle ?? "solid",
      roughness: options.roughness ?? 1,
      roundness: { type: 2 }
    }),
    points,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: options.startArrowhead ?? null,
    endArrowhead: options.endArrowhead ?? "arrow",
    elbowed: false
  });
  if (options.label) {
    addText(`${id}-label`, frameId, options.labelX, options.labelY, options.labelWidth ?? 150,
      options.label, options.labelSize ?? 15, options.strokeColor ?? palette.muted, "center");
  }
}

// Frame 1: the repository map.
addFrame("frame-code", 40, 40, 1100, 900, "1 · CODE MAP");
addText("code-title", "frame-code", 80, 75, 980, "1 · CODE MAP", 32, palette.teal);
addText("code-subtitle", "frame-code", 80, 120, 980,
  "A small TypeScript codebase with clear ownership boundaries", 18, palette.muted);

addCard("web-card", "frame-code", 85, 190, 320, 210, "web/  ·  Next.js",
  "app/page.tsx\nRecruiter workspace + state\n\nlib/types.ts\nTyped API contract\n\napp/globals.css\nExisting presentation layer", {
    backgroundColor: palette.blueFill,
    strokeColor: palette.blue,
    titleColor: palette.blue
  });
addCard("app-card", "frame-code", 475, 175, 590, 100, "server/src/app.ts",
  "Express routes · middleware · TypeDI composition root", {
    backgroundColor: palette.tealFill,
    strokeColor: palette.teal,
    titleColor: palette.teal
  });
addCard("controller-card", "frame-code", 475, 315, 590, 90, "controllers/match.controller.ts",
  "Validate HTTP input → call the match service → return one complete response", {
    backgroundColor: palette.grayFill,
    strokeColor: palette.ink,
    bodyTop: 50
  });

addCard("match-service-card", "frame-code", 475, 450, 180, 160, "match.service.ts",
  "Orchestrates\ncache → retrieval\n→ score → persist", {
    backgroundColor: palette.tealFill,
    strokeColor: palette.teal,
    titleSize: 18,
    bodySize: 15,
    align: "center"
  });
addCard("guidance-service-card", "frame-code", 680, 450, 180, 160, "guidance.service.ts",
  "Hybrid intent\nparser + typed\noverrides", {
    backgroundColor: palette.purpleFill,
    strokeColor: palette.purple,
    titleSize: 18,
    bodySize: 15,
    align: "center"
  });
addCard("scoring-service-card", "frame-code", 885, 450, 180, 160, "scoring.service.ts",
  "Deterministic\nfit, filters, rank\nand confidence", {
    backgroundColor: palette.orangeFill,
    strokeColor: palette.orange,
    titleSize: 18,
    bodySize: 15,
    align: "center"
  });

addCard("candidate-repo-card", "frame-code", 475, 655, 180, 130, "candidate.repository",
  "pgvector retrieval\n+ deduplication", {
    backgroundColor: palette.grayFill,
    titleSize: 17,
    bodySize: 14,
    align: "center"
  });
addCard("match-repo-card", "frame-code", 680, 655, 180, 130, "match.repository",
  "Atomic run/results\npersistence + brief", {
    backgroundColor: palette.grayFill,
    titleSize: 17,
    bodySize: 14,
    align: "center"
  });
addCard("openai-gateway-card", "frame-code", 885, 655, 180, 130, "openai.gateway",
  "Embeddings + typed\nStructured Outputs", {
    backgroundColor: palette.grayFill,
    titleSize: 17,
    bodySize: 14,
    align: "center"
  });

addCard("data-card", "frame-code", 85, 470, 320, 135, "data/*.csv",
  "10 open roles · 120 candidate profiles\nNormalized and embedded during idempotent seed", {
    backgroundColor: palette.cream,
    strokeColor: palette.orange,
    titleColor: palette.orange,
    bodySize: 15
  });
addCard("docs-card", "frame-code", 85, 660, 320, 125, "docs/",
  "Prompts · matching formulas · example run\nExcalidraw walkthrough · Loom script", {
    backgroundColor: palette.cream,
    strokeColor: palette.muted,
    titleColor: palette.muted,
    bodySize: 15
  });

addPill("postgres-pill", "frame-code", 475, 835, 270, 70, "Railway Postgres + pgvector", palette.tealFill, palette.teal, 17);
addPill("openai-pill", "frame-code", 795, 835, 270, 70, "OpenAI Responses + Embeddings", palette.purpleFill, palette.purple, 17);

addArrow("web-to-app", "frame-code", 405, 285, [[0, 0], [70, 0]], { strokeColor: palette.blue });
addArrow("app-to-controller", "frame-code", 770, 275, [[0, 0], [0, 40]], { strokeColor: palette.teal });
addArrow("controller-to-match", "frame-code", 770, 405, [[0, 0], [-205, 45]], { strokeColor: palette.ink });
addArrow("controller-to-guidance", "frame-code", 770, 405, [[0, 0], [0, 45]], { strokeColor: palette.ink });
addArrow("controller-to-score", "frame-code", 770, 405, [[0, 0], [205, 45]], { strokeColor: palette.ink });
addArrow("services-to-repos", "frame-code", 770, 610, [[0, 0], [0, 45]], { strokeColor: palette.muted });
addArrow("data-to-repo", "frame-code", 405, 540, [[0, 0], [45, 0], [45, 180], [25, 180]], { strokeColor: palette.orange });
addArrow("candidate-to-postgres", "frame-code", 565, 785, [[0, 0], [0, 50]], { strokeColor: palette.teal });
addArrow("match-to-postgres", "frame-code", 770, 785, [[0, 0], [-70, 50]], { strokeColor: palette.teal });
addArrow("gateway-to-openai", "frame-code", 975, 785, [[0, 0], [0, 50]], { strokeColor: palette.purple });

// Frame 2: the complete matching request.
addFrame("frame-flow", 1180, 40, 2200, 1230, "2 · END-TO-END MATCHING FLOW");
addText("flow-title", "frame-flow", 1220, 75, 2050, "2 · END-TO-END MATCHING FLOW", 32, palette.teal);
addText("flow-subtitle", "frame-flow", 1220, 120, 2050,
  "AI handles language and explanation. Deterministic code owns eligibility, score and rank.", 18, palette.muted);

addPill("recruiter-pill", "frame-flow", 1230, 200, 210, 80, "Recruiter", palette.cream, palette.ink, 20);
addPill("next-pill", "frame-flow", 1495, 200, 230, 80, "Next.js workspace", palette.blueFill, palette.blue, 18);
addPill("post-pill", "frame-flow", 1780, 200, 230, 80, "POST /api/matches", palette.grayFill, palette.ink, 18);
addCard("load-role-card", "frame-flow", 2065, 180, 280, 120, "Load role + data version",
  "Parallel DB reads; validate role", {
    backgroundColor: palette.tealFill,
    strokeColor: palette.teal,
    titleSize: 18,
    bodySize: 15,
    align: "center"
  });
addDiamond("cache-diamond", "frame-flow", 2410, 165, 190, 150, "Exact result\nin cache?");
addCard("cache-hit-card", "frame-flow", 2670, 180, 300, 120, "YES · reuse stable result",
  "Fresh run ID + independent approval state", {
    backgroundColor: palette.tealFill,
    strokeColor: palette.teal,
    titleSize: 18,
    bodySize: 15,
    align: "center"
  });
addCard("cache-response-card", "frame-flow", 3040, 180, 280, 120, "Complete response",
  "Same ranking, scores and brief", {
    backgroundColor: palette.blueFill,
    strokeColor: palette.blue,
    titleSize: 19,
    bodySize: 15,
    align: "center"
  });

addCard("guidance-card", "frame-flow", 1230, 420, 390, 170, "Interpret recruiter guidance",
  "OpenAI → typed criteria\nDeterministic wording rules → required / preferred\nRecruiter overrides remain explicit", {
    backgroundColor: palette.purpleFill,
    strokeColor: palette.purple,
    titleColor: palette.purple,
    bodySize: 16
  });
addCard("query-card", "frame-flow", 1680, 440, 300, 130, "Build retrieval query",
  "Role + skills + interpreted guidance", {
    backgroundColor: palette.grayFill,
    titleSize: 18,
    bodySize: 15,
    align: "center"
  });
addCard("embedding-card", "frame-flow", 2040, 440, 300, 130, "OpenAI embedding",
  "text-embedding-3-small · 256D", {
    backgroundColor: palette.purpleFill,
    strokeColor: palette.purple,
    titleColor: palette.purple,
    titleSize: 18,
    bodySize: 15,
    align: "center"
  });
addCard("vector-card", "frame-flow", 2400, 420, 330, 170, "pgvector retrieval",
  "Cosine similarity + HNSW index\nRetrieve up to 120 profiles\nBroad recall, not final ranking", {
    backgroundColor: palette.tealFill,
    strokeColor: palette.teal,
    titleColor: palette.teal,
    bodySize: 16,
    align: "center"
  });
addCard("dedupe-card", "frame-flow", 2790, 440, 300, 130, "Exact deduplication",
  "Fingerprint groups duplicate profiles", {
    backgroundColor: palette.grayFill,
    titleSize: 18,
    bodySize: 15,
    align: "center"
  });

addCard("score-card", "frame-flow", 2790, 700, 300, 150, "Deterministic scoring",
  "Skills · evidence · experience\nnice-to-haves · role location", {
    backgroundColor: palette.orangeFill,
    strokeColor: palette.orange,
    titleColor: palette.orange,
    titleSize: 18,
    bodySize: 15,
    align: "center"
  });
addCard("filter-card", "frame-flow", 2400, 690, 330, 170, "Eligibility + guardrails",
  "Required guidance filters\nRelevance floor\nKnown experience minimum", {
    backgroundColor: palette.orangeFill,
    strokeColor: palette.orange,
    titleColor: palette.orange,
    bodySize: 16,
    align: "center"
  });
addCard("sort-card", "frame-flow", 2020, 700, 320, 150, "Sort + top 5",
  "eligible → qualified → score ↓\n→ confidence ↓", {
    backgroundColor: palette.orangeFill,
    strokeColor: palette.orange,
    titleColor: palette.orange,
    titleSize: 18,
    bodySize: 15,
    align: "center"
  });
addCard("brief-card", "frame-flow", 1630, 690, 330, 170, "OpenAI evidence briefs",
  "Explain final deterministic result\n1+ gaps · exactly 3 questions\nCannot rerank", {
    backgroundColor: palette.purpleFill,
    strokeColor: palette.purple,
    titleColor: palette.purple,
    bodySize: 15,
    align: "center"
  });
addCard("persist-card", "frame-flow", 1230, 700, 330, 150, "Atomic persistence",
  "One SQL statement stores run + results", {
    backgroundColor: palette.tealFill,
    strokeColor: palette.teal,
    titleColor: palette.teal,
    titleSize: 18,
    bodySize: 15,
    align: "center"
  });

addCard("response-card", "frame-flow", 1230, 990, 310, 135, "Complete API response",
  "Rank, score, evidence, gaps, questions", {
    backgroundColor: palette.blueFill,
    strokeColor: palette.blue,
    titleColor: palette.blue,
    titleSize: 18,
    bodySize: 15,
    align: "center"
  });
addCard("review-card", "frame-flow", 1630, 990, 310, 135, "Human review",
  "Inspect evidence; select candidates", {
    backgroundColor: palette.cream,
    strokeColor: palette.ink,
    titleSize: 18,
    bodySize: 15,
    align: "center"
  });
addCard("approval-card", "frame-flow", 2030, 990, 310, 135, "Approve shortlist",
  "API verifies IDs belong to this run", {
    backgroundColor: palette.cream,
    strokeColor: palette.ink,
    titleSize: 18,
    bodySize: 15,
    align: "center"
  });
addCard("markdown-card", "frame-flow", 2430, 990, 310, 135, "Hiring-manager brief",
  "Copy or download Markdown", {
    backgroundColor: palette.tealFill,
    strokeColor: palette.teal,
    titleColor: palette.teal,
    titleSize: 18,
    bodySize: 15,
    align: "center"
  });

addPill("principle-pill", "frame-flow", 2830, 990, 490, 135,
  "TRUST BOUNDARY\nThe model never chooses the rank", palette.orangeFill, palette.orange, 20);

addArrow("recruiter-to-next", "frame-flow", 1440, 240, [[0, 0], [55, 0]], { strokeColor: palette.blue });
addArrow("next-to-post", "frame-flow", 1725, 240, [[0, 0], [55, 0]], { strokeColor: palette.blue });
addArrow("post-to-load", "frame-flow", 2010, 240, [[0, 0], [55, 0]], { strokeColor: palette.ink });
addArrow("load-to-cache", "frame-flow", 2345, 240, [[0, 0], [65, 0]], { strokeColor: palette.teal });
addArrow("cache-to-hit", "frame-flow", 2600, 240, [[0, 0], [70, 0]], {
  strokeColor: palette.teal,
  label: "hit",
  labelX: 2600,
  labelY: 205,
  labelWidth: 70
});
addArrow("hit-to-response", "frame-flow", 2970, 240, [[0, 0], [70, 0]], { strokeColor: palette.teal });
addArrow("cache-to-guidance", "frame-flow", 2505, 315, [[0, 0], [0, 50], [-1080, 50], [-1080, 105]], {
  strokeColor: palette.orange,
  label: "miss",
  labelX: 2360,
  labelY: 330,
  labelWidth: 80
});
addArrow("guidance-to-query", "frame-flow", 1620, 505, [[0, 0], [60, 0]], { strokeColor: palette.purple });
addArrow("query-to-embedding", "frame-flow", 1980, 505, [[0, 0], [60, 0]], { strokeColor: palette.ink });
addArrow("embedding-to-vector", "frame-flow", 2340, 505, [[0, 0], [60, 0]], { strokeColor: palette.purple });
addArrow("vector-to-dedupe", "frame-flow", 2730, 505, [[0, 0], [60, 0]], { strokeColor: palette.teal });
addArrow("dedupe-to-score", "frame-flow", 2940, 570, [[0, 0], [0, 130]], { strokeColor: palette.ink });
addArrow("score-to-filter", "frame-flow", 2790, 775, [[0, 0], [-60, 0]], { strokeColor: palette.orange });
addArrow("filter-to-sort", "frame-flow", 2400, 775, [[0, 0], [-60, 0]], { strokeColor: palette.orange });
addArrow("sort-to-brief", "frame-flow", 2020, 775, [[0, 0], [-60, 0]], { strokeColor: palette.orange });
addArrow("brief-to-persist", "frame-flow", 1630, 775, [[0, 0], [-70, 0]], { strokeColor: palette.purple });
addArrow("persist-to-response", "frame-flow", 1395, 850, [[0, 0], [0, 140]], { strokeColor: palette.teal });
addArrow("response-to-review", "frame-flow", 1540, 1058, [[0, 0], [90, 0]], { strokeColor: palette.blue });
addArrow("review-to-approval", "frame-flow", 1940, 1058, [[0, 0], [90, 0]], { strokeColor: palette.ink });
addArrow("approval-to-markdown", "frame-flow", 2340, 1058, [[0, 0], [90, 0]], { strokeColor: palette.teal });

// Frame 3: the scoring contract.
addFrame("frame-score", 40, 980, 1100, 1100, "3 · SCORE + GUARDRAILS");
addText("score-title", "frame-score", 80, 1015, 980, "3 · SCORE + GUARDRAILS", 32, palette.teal);
addText("score-subtitle", "frame-score", 80, 1060, 980,
  "Every displayed point is reproducible from supplied evidence", 18, palette.muted);

addPill("technical-total", "frame-score", 85, 1125, 980, 75,
  "TECHNICAL ROLE FIT = 100 POINTS", palette.cream, palette.ink, 22);
addPill("skills-points", "frame-score", 85, 1245, 180, 105, "Required skills\n40", palette.tealFill, palette.teal, 20);
addPill("evidence-points", "frame-score", 285, 1245, 180, 105, "Role evidence\n30", palette.blueFill, palette.blue, 20);
addPill("experience-points", "frame-score", 485, 1245, 180, 105, "Experience\n10", palette.orangeFill, palette.orange, 20);
addPill("nice-points", "frame-score", 685, 1245, 180, 105, "Nice-to-have\n5", palette.purpleFill, palette.purple, 20);
addPill("location-points", "frame-score", 885, 1245, 180, 105, "Role location\n15", palette.grayFill, palette.ink, 20);

addCard("gate-card", "frame-score", 85, 1410, 470, 270, "ELIGIBILITY GATE",
  "• At least 50% required skills evidenced\n• Technical role fit ≥ 45\n• Known experience ≥ effective minimum\n• Required recruiter criteria must pass\n\nHard requirements filter. They never add bonus points.", {
    backgroundColor: palette.orangeFill,
    strokeColor: palette.orange,
    titleColor: palette.orange,
    bodySize: 17
  });
addCard("guidance-score-card", "frame-score", 595, 1410, 470, 270, "RECRUITER GUIDANCE",
  "No preferences\nfinal score = technical role fit\n\nWith preferences\nfinal = 70% technical + 30% priorities\n\n“Should / must” → required\n“Prefer / ideally” → preferred", {
    backgroundColor: palette.purpleFill,
    strokeColor: palette.purple,
    titleColor: palette.purple,
    bodySize: 17
  });
addCard("ordering-card", "frame-score", 85, 1735, 980, 150, "VISIBLE ORDER",
  "eligible → qualified → final score descending → evidence confidence descending\n\nExperience is asymmetric: below minimum excludes; above maximum gets a small penalty; unknown stays reviewable.", {
    backgroundColor: palette.tealFill,
    strokeColor: palette.teal,
    titleColor: palette.teal,
    bodySize: 17,
    bodyTop: 52
  });
addCard("confidence-card", "frame-score", 85, 1935, 980, 105, "CONFIDENCE IS NOT FIT",
  "Confidence measures profile completeness and data quality. It never replaces the match score.", {
    backgroundColor: palette.grayFill,
    strokeColor: palette.muted,
    titleColor: palette.muted,
    bodySize: 17,
    bodyTop: 50
  });

const diagram = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements: [...frames, ...connectors, ...shapes, ...texts],
  appState: {
    gridSize: null,
    gridStep: 5,
    gridModeEnabled: false,
    viewBackgroundColor: "#f8f5ee"
  },
  files: {}
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(diagram, null, 2)}\n`, "utf8");
console.log(`Wrote ${diagram.elements.length} elements to ${outputPath}`);
