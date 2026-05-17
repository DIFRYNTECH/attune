export const TASKS = {
  rest: [
    "Sit quietly and take 5 slow breaths",
    "Hold a warm drink and focus on the warmth",
    "Listen to one calming song with eyes closed",
    "Look at one photo that makes you feel safe",
    "Open a window and feel fresh air for 2 minutes",
    "Put a hand on your chest and breathe slowly",
    "Watch a short nature video (5 minutes)",
    "Send a simple \"thinking of you\" message (optional)",
    "Light a candle and sit with it for 3 minutes",
    "Do a gentle body scan while lying down",
    "Wrap in a blanket and rest without guilt",
    "Wash your face with warm water, slowly",
    "Smell a lotion or oil you like (one minute)",
    "Sit in sunlight for 3-5 minutes (if possible)",
    "Pick one tiny comfort: softer light, quieter sound, warmer socks"
  ],
  gentle: [
    "Sit outside for 5 minutes",
    "Listen to one song without scrolling",
    "Put on a \"good\" song and do one small sway",
    "Stretch shoulders gently for 2 minutes",
    "Make a warm drink mindfully",
    "Water a plant",
    "Write one sentence about how you feel",
    "Write one sentence about what you want more of",
    "Fold one item of clothing",
    "Step into fresh air for 2 minutes",
    "Do 3 slow breaths and relax your jaw",
    "Watch something light for 10 minutes",
    "Organize 5 photos on your phone",
    "Send one kind message to someone you trust",
    "Make a small plan for something pleasant later (even 5 minutes)"
  ],
  light: [
    "Take a short walk (5-8 minutes)",
    "Tidy one small surface (5 minutes)",
    "Do a quick stretch + shoulder roll (4 minutes)",
    "Make a simple snack and actually sit to eat it",
    "Reply to one message you’ve been avoiding (optional)",
    "Start one small chore, then stop at 8 minutes",
    "Put on music and do light movement (6 minutes)",
    "Step outside for 3 minutes and reset your eyes on the sky",
    "Write a tiny list: 2 priorities + 1 treat",
    "Do one ‘future-you’ setup (water, charger, clothes)",
    "Clear one tiny pile (counter, chair, desk corner)",
    "Pick one nice thing for your space (light, scent, tidy)"
  ],
  steady: [
    "Walk around the house for 5 minutes",
    "Tidy one small surface (5 minutes)",
    "Do a gentle stretch routine (8 minutes)",
    "Choose a simple meal idea for later",
    "Sort one drawer section for 10 minutes",
    "Read 2 pages of a book",
    "Put on music and do light movement for 5 minutes",
    "Write a short list: 3 things that helped recently",
    "Write a short list: 3 things you’re looking forward to (even tiny)",
    "Do a word search or easy puzzle (10 minutes)",
    "Step outside and look at the sky for 5 minutes",
    "Listen to a short podcast segment (10 minutes)",
    "Set a 10-minute timer and do one calm task",
    "Do one small thing that makes your space nicer (light, scent, tidy)"
  ],
  capable: [
    "Take a short walk outside (10-15 minutes if comfortable)",
    "Prepare a simple snack or light meal",
    "Do a gentle mobility routine (12 minutes)",
    "Organize a small area (15 minutes)",
    "Call or voice note someone supportive",
    "Plan one enjoyable thing for later (small + realistic)",
    "Try a beginner yoga/stretch video (10 minutes)",
    "Plan tomorrow’s one small task",
    "Sort 20 photos into an album",
    "Do a simple household task with breaks (15 minutes)",
    "Write down 3 small wins from today",
    "Spend 15 minutes on a hobby (music, craft, reading)",
    "Do a seated strength routine (10 minutes if safe)",
    "Do a small kindness for future-you (set out clothes, charge device, prep water)",
    "Do one 20-minute focused block on the task that matters most",
    "Practice one skill you care about for 15 minutes",
    "Write the next clear move for a goal and start it for 10 minutes",
    "Clean up one system that would make tomorrow easier"
  ],
  brave: [
    "Take a short walk + one extra minute (if safe)",
    "Do a slightly longer tidy session (20 minutes with breaks)",
    "Try a new gentle stretch you haven’t done before",
    "Write a short note: what you’re proud of surviving",
    "Choose one uncomfortable-but-safe task and do 5 minutes of it",
    "Do a small social reach-out (message or short call)",
    "Share one small win with someone (or write it down)",
    "Try a guided relaxation (10 minutes)",
    "Cook or prep something simple you’ll enjoy later",
    "Sort a meaningful set of items/photos you’ve avoided",
    "Do 10 minutes of movement, then stop (no pushing)",
    "Pick one small boundary for tomorrow and write it down",
    "Do one 30-minute focused block with your phone away",
    "Send the message that moves one goal forward",
    "Choose one hard-but-safe task and make a 15-minute start",
    "Draft the first rough version of something you have been avoiding",
    "Do a ‘reset’ shower or wash-up and change into fresh clothes"
  ]
};

const TASK_EXPANSIONS = {
  rest: [
    "Rest your eyes for 2 minutes and loosen your jaw",
    "Place both feet down and breathe for 6 slow counts",
    "Sip water slowly and notice the temperature",
    "Set your phone aside and sit quietly for one minute",
    "Soften the lights around you for the next 10 minutes",
    "Put on socks or a layer that feels comfortable",
    "Lean back and release your shoulders for 5 breaths",
    "Look out of a window and name 3 quiet things",
    "Hold something warm and let your hands settle",
    "Play one calm song and let your body stay still",
    "Close your eyes and unclench your hands",
    "Move one thing away from your immediate space",
    "Choose the easiest seat in the room and sit there",
    "Notice one color near you for 30 seconds",
    "Take three slow breaths before checking your phone",
    "Put a glass of water within reach",
    "Let your shoulders drop and breathe out twice",
    "Look at a calm image for one minute",
    "Turn one loud thing down or off",
    "Rest one hand on your chest for 5 breaths",
    "Wash your hands slowly with warm water",
    "Wrap your hands around a mug for one minute",
    "Sit somewhere softer for 3 minutes",
    "Name one thing that does not need doing right now",
    "Make your next 5 minutes quieter",
    "Place one comfort item closer to you",
    "Pause with both feet on the floor for 60 seconds",
    "Take one slow breath before standing up",
    "Let your face relax while you count to 20",
    "Choose a calmer sound for the room",
    "Rest your gaze on one steady object for a minute",
    "Place your phone face down for 2 minutes",
    "Take one slow sip and let your shoulders drop",
    "Let your hands rest open on your lap",
    "Move to the quietest spot you can reach",
    "Choose one thing to leave exactly as it is",
    "Breathe out slowly before answering anything",
    "Put one soft item near your seat",
    "Turn your attention to one sound for 30 seconds",
    "Sit back and let your jaw loosen twice"
  ],
  gentle: [
    "Open a curtain and let in a little light",
    "Write one sentence about what feels manageable",
    "Clear one item from the surface nearest you",
    "Make your bed corner or pillow feel neater",
    "Stretch your fingers and wrists for one minute",
    "Step outside the door and take 3 breaths",
    "Choose one small snack or drink for later",
    "Reply with one simple sentence if it feels easy",
    "Put one item back where it belongs",
    "Read one paragraph and then stop",
    "Listen to one song while standing up",
    "Walk to another room and back slowly",
    "Write down the next tiny thing, not the whole plan",
    "Fold or hang one piece of clothing",
    "Put your charger, keys, or water in an easier spot",
    "Wipe one small area for 60 seconds",
    "Choose one pleasant thing to do after this",
    "Stretch your neck gently from side to side",
    "Send one low-pressure check-in message",
    "Step into fresh air and notice the sky",
    "Put away 3 small items within reach",
    "Write one thing you are allowed to leave for later",
    "Make one corner of the room easier to look at",
    "Choose a comfortable place to sit for 5 minutes",
    "Take one gentle lap around your space",
    "Set out water for your next break",
    "Play a familiar song while you reset one item",
    "Write one sentence about what would help",
    "Put one dish or cup in the kitchen",
    "Choose one softer light or sound",
    "Place one thing in a better spot for later",
    "Write one tiny permission slip for the day",
    "Rinse one cup or plate slowly",
    "Choose one small comfort before the next task",
    "Open one note and write the gentlest next step",
    "Take a short lap and touch one doorway",
    "Put one wrapper, receipt, or loose item away",
    "Name one thing that can be smaller today",
    "Choose one easy message to leave for later",
    "Make your chair or seat more comfortable"
  ],
  light: [
    "Clear the top of one chair or small surface",
    "Walk outside for 5 minutes and come back",
    "Write a 3-item list for the next hour",
    "Prepare a simple drink and sit while you have it",
    "Start one chore and stop when the timer reaches 6 minutes",
    "Send one message that has a clear next step",
    "Sort 5 photos, files, or notes into one place",
    "Pick one object to remove from your workspace",
    "Stretch your shoulders and wrists for 4 minutes",
    "Choose tomorrow's first small step and write it down",
    "Read 2 pages or one short article section",
    "Set a 7-minute timer and tidy only one zone",
    "Put on music and move lightly for one song",
    "Prepare one easy snack before you get too hungry",
    "Write one line about what you finished recently",
    "Open one document or list and choose the first move",
    "Reply to one easy message with a short answer",
    "Pack or place one thing you will need later",
    "Make one part of your desk easier to use",
    "Walk to get water and stretch once before sitting",
    "Choose one tab, note, or app to close",
    "Write a tiny list: one key thing, one maybe, one kind thing",
    "Set out clothes, charger, or keys for later",
    "Start one small household task and stop at 8 minutes",
    "Organize 5 items that are already in front of you",
    "Take a 5-minute reset away from your main screen",
    "Send a one-line update to someone waiting",
    "Choose one small thing to make tomorrow easier",
    "Put one recurring task in a clearer place",
    "Step outside and notice 3 things before returning",
    "Write one sentence that names the real constraint",
    "Put 3 loose items into one container",
    "Make one small part of your screen less busy",
    "Choose a 5-minute task and set a clear stop point",
    "Prepare one simple comfort for after work",
    "Move one task from memory into a note",
    "Clear one small path where you walk often",
    "Pick one thing to do seated instead of standing",
    "Write one line about what would make today easier",
    "Take 4 minutes to reset light, sound, or temperature"
  ],
  steady: [
    "Draft the next sentence for one task and stop",
    "Sort one small digital folder for 10 minutes",
    "Prepare one simple meal component for later",
    "Write the first 3 bullets for something important",
    "Clear one workspace zone for 10 minutes",
    "Practice one skill for 8 minutes, then pause",
    "Choose one errand or admin step and make it smaller",
    "Walk for 8 minutes without turning it into exercise",
    "Send one useful message that moves something forward",
    "Set a 10-minute timer and finish one small loop",
    "Read one useful page and write one takeaway",
    "Pick one task and define the smallest acceptable finish",
    "Organize one shelf, drawer, or folder for 10 minutes",
    "Write down 3 wins and one thing to leave alone",
    "Prepare your next work block with one clear target",
    "Move one avoided item into the right place",
    "Choose one practical thing to do before lunch",
    "Make one simple plan for the next 2 hours",
    "Tidy one visible area until it feels easier to use",
    "Start one task with a 10-minute timer and a stop point",
    "Reply to one message using a simple direct sentence",
    "Choose one thing to finish instead of five to start",
    "Make a small list of what can wait",
    "Update one note, calendar item, or reminder",
    "Prepare one item that helps tomorrow begin smoother",
    "Sort 10 photos, files, or saved items",
    "Do one calm household task for 10 minutes",
    "Write one paragraph of a rough first version",
    "Take one steady walk around the block if possible",
    "Choose one point of friction and reduce it"
  ],
  capable: [
    "Draft a rough version of one thing you want finished",
    "Practice one skill with a clear 15-minute stop point",
    "Clean one small system: folder, drawer, list, or bag",
    "Write the next 5 steps for one goal, then pick only one",
    "Do a 15-minute focused block with notifications off",
    "Prepare a better setup for tomorrow's first task",
    "Send the message that would clarify the next step",
    "Choose one meaningful task and make a 12-minute start",
    "Sort one backlog area for 15 minutes",
    "Plan one realistic progress step for the next 24 hours",
    "Start a rough outline for something you have delayed",
    "Move one important task from vague to specific",
    "Do 12 minutes of movement that leaves you feeling better",
    "Prepare a simple meal, snack, or bottle of water for later",
    "Review one list and remove 3 tasks that no longer matter",
    "Create a 15-minute block for one priority",
    "Write a short update for someone who needs context",
    "Make one piece of your space easier to work in",
    "Choose one healthy boundary and write the exact sentence",
    "Do one useful reset before the day gets crowded",
    "Read one useful section and capture one action",
    "Set up the first step for a task you will do later",
    "Finish one small admin loop from start to done",
    "Practice one tricky thing slowly for 10 minutes",
    "Clear one source of friction from your morning",
    "Make a 15-minute start on the task with the clearest payoff",
    "Choose one thing to delegate, delay, or delete",
    "Write the first rough paragraph before judging it",
    "Organize one small area so it supports your next move",
    "Take one progress step and stop before it becomes too much"
  ],
  brave: [
    "Send one clear message you have been postponing",
    "Draft the imperfect first version for 15 minutes",
    "Choose the task with the most relief and start for 10 minutes",
    "Make one direct ask in a message or note",
    "Practice one uncomfortable skill for 10 minutes, then stop",
    "Clear one avoided pile with a 15-minute timer",
    "Write the boundary sentence before you need it",
    "Open the thing you have avoided and do the first tiny step",
    "Finish one visible task that would make tonight easier",
    "Do one focused block and leave your phone in another room",
    "Start one meaningful task with a deliberately rough version",
    "Make one decision you have been circling",
    "Send one progress update instead of waiting for perfect",
    "Prepare one brave-but-kind next step for tomorrow",
    "Choose one task to close, not expand",
    "Do 15 minutes of movement with an easy exit",
    "Write down what you are avoiding and the smallest next move",
    "Tidy one neglected area until the timer ends",
    "Ask for one piece of help or clarity",
    "Move one goal into a calendar block or reminder",
    "Share one honest win with someone safe",
    "Start the hard thing for 5 minutes and stop on purpose",
    "Make one future-facing choice: save, schedule, or simplify",
    "Draft one message that protects your time",
    "Choose one stretch step that still respects your energy",
    "Review one commitment and make the next action explicit",
    "Do one practical thing you will thank yourself for later",
    "Prepare your environment for a focused 20-minute block",
    "Write a rough plan for the thing you keep restarting",
    "Close one open loop before opening another"
  ]
};

export const TASK_LIBRARY = Object.freeze(
  Object.fromEntries(
    Object.entries(TASKS).map(([pace, tasks]) => [
      pace,
      Object.freeze([...tasks, ...(TASK_EXPANSIONS[pace] || [])]),
    ])
  )
);

const DOMAIN_RULES = [
  ["body", /\b(shoulder|jaw|breath|breathe|stretch|body|face|wash|walk|movement|mobility|strength|yoga|chest|eyes)\b/],
  ["environment", /\b(space|surface|desk|counter|room|light|window|plant|tidy|clear|organize|chair|drawer|pile|scent|candle)\b/],
  ["practical", /\b(list|plan|setup|prepare|sort|fold|reply|task|chore|charger|clothes|meal|snack|water|cook|prep)\b/],
  ["connection", /\b(message|call|voice note|someone|supportive|trust|share|text|social)\b/],
  ["comfort", /\b(song|music|photo|warm drink|blanket|hobby|podcast|nature|comfort|quiet|socks|lotion|oil|sunlight)\b/],
  ["reflection", /\b(write|sentence|note|wins|proud|helped|feel|surviving|looking forward)\b/],
  ["meaning", /\b(goal|boundary|future|tomorrow|important|meaningful|care about|skill)\b/],
  ["progress", /\b(start|draft|focused|focus|practice|forward|avoiding|rough version|block)\b/],
];

const STRETCH_TERMS = /\b(start|reply|send|plan|tomorrow|goal|forward|focused|focus|practice|skill|draft|boundary|uncomfortable|avoiding|avoided|organize|sort|prepare|call|share|rough|version|block|finish|remove|define)\b/;
const SUPPORT_TERMS = /\b(sit|quiet|slow|warm|comfort|rest|pause|breath|breathe|blanket|gentle|small|tiny|soft|safe|drink|song|music|window|sunlight|jaw|shoulder|sway|fresh air)\b/;
const HIGH_FRICTION_TERMS = /\b(reply|call|send|uncomfortable|avoiding|avoided|focused|focus|hard|goal|boundary|draft)\b/;
const LOW_FRICTION_TERMS = /\b(sit|quiet|breath|warm|gentle|small|tiny|one|simple|optional|comfort|slow)\b/;
const STOP_WORDS = new Set([
  "and", "the", "for", "with", "one", "your", "you", "that", "this", "then", "into", "from", "what", "been",
  "small", "simple", "gentle", "minutes", "minute", "min", "thing", "safe", "optional", "later", "today",
]);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeText(value).replace(/\s+/g, "-").slice(0, 80);
}

function tokens(value) {
  return normalizeText(value)
    .split(" ")
    .filter((word) => word.length >= 3)
    .filter((word) => !STOP_WORDS.has(word));
}

function inferDomain(text) {
  const normalized = normalizeText(text);
  for (const [domain, pattern] of DOMAIN_RULES) {
    if (pattern.test(normalized)) return domain;
  }
  return "regulation";
}

function inferEffort(text, pace) {
  const normalized = normalizeText(text);
  let effort = {
    rest: 1,
    gentle: 1.5,
    light: 2,
    steady: 2.5,
    capable: 3,
    brave: 3.25,
  }[pace] || 2;

  const duration = normalized.match(/\b(\d+)\s*(minute|minutes|min)\b/);
  if (duration) {
    const minutes = Number(duration[1]);
    if (minutes <= 3) effort = Math.min(effort, 1.5);
    else if (minutes <= 8) effort = Math.max(effort, 2);
    else if (minutes <= 15) effort = Math.max(effort, 3);
    else effort = Math.max(effort, 4);
  }

  if (HIGH_FRICTION_TERMS.test(normalized)) effort += 0.6;
  if (LOW_FRICTION_TERMS.test(normalized)) effort -= 0.45;
  return Math.max(1, Math.min(5, Math.round(effort * 2) / 2));
}

function inferFriction(text, effort) {
  const normalized = normalizeText(text);
  let friction = effort;
  if (HIGH_FRICTION_TERMS.test(normalized)) friction += 0.8;
  if (LOW_FRICTION_TERMS.test(normalized)) friction -= 0.6;
  if (/\b(optional|if possible|if comfortable|if safe)\b/.test(normalized)) friction -= 0.4;
  return Math.max(1, Math.min(5, Math.round(friction * 2) / 2));
}

function inferMode(text, pace, effort, friction) {
  const normalized = normalizeText(text);
  const stretchScore = (STRETCH_TERMS.test(normalized) ? 2 : 0) + (effort >= 3 ? 1 : 0) + (friction >= 3.5 ? 1 : 0);
  const supportScore = (SUPPORT_TERMS.test(normalized) ? 2 : 0) + (effort <= 2 ? 1 : 0) + (friction <= 2 ? 1 : 0);

  if (STRETCH_TERMS.test(normalized) && pace !== "rest" && stretchScore >= supportScore) return "stretch";
  if (STRETCH_TERMS.test(normalized) && effort >= 2.5 && stretchScore >= supportScore - 1) return "stretch";
  if (stretchScore > supportScore) return "stretch";
  if (supportScore > stretchScore) return "support";
  return pace === "capable" || pace === "brave" ? "stretch" : "support";
}

function repetitionFamily(text, domain) {
  const normalized = normalizeText(text)
    .replace(/\b\d+\b/g, "")
    .replace(/\bminutes?\b|\bmin\b|\bif safe\b|\bif possible\b|\boptional\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/\btidy\b|\bclear\b|\borganize\b|\bsort\b|\bfold\b/.test(normalized)) {
    return `${domain}:small-space-order`;
  }
  if (/\bwalk\b|\boutside\b|\bfresh air\b|\bsky\b|\bsunlight\b/.test(normalized)) {
    return `${domain}:outside-reset`;
  }
  if (/\bwrite\b|\blist\b|\bnote\b|\bproud\b|\bwins\b|\bhelped\b/.test(normalized)) {
    return `${domain}:written-reflection`;
  }
  if (/\bsong\b|\bmusic\b|\bpodcast\b|\bvideo\b|\blisten\b|\bwatch\b/.test(normalized)) {
    return `${domain}:audio-visual-comfort`;
  }
  if (/\bmessage\b|\bcall\b|\bvoice note\b|\bsocial\b|\bshare\b/.test(normalized)) {
    return `${domain}:connection-reachout`;
  }
  if (/\bstretch\b|\bmovement\b|\bmobility\b|\byoga\b|\bstrength\b|\bbody scan\b|\bbreath\b|\bbreathe\b/.test(normalized)) {
    return `${domain}:body-reset`;
  }
  if (/\bdrink\b|\bsnack\b|\bmeal\b|\bcook\b|\bprep\b|\bwater\b/.test(normalized)) {
    return `${domain}:food-drink-care`;
  }
  if (/\bfocused\b|\bfocus\b|\bgoal\b|\bdraft\b|\bpractice\b|\bstart\b/.test(normalized)) {
    return `${domain}:gentle-progress-start`;
  }

  return `${domain}:${tokens(normalized).slice(0, 4).join("-") || slugify(normalized)}`;
}

function taskMetadata(text, pace) {
  const domain = inferDomain(text);
  const effort = inferEffort(text, pace);
  const friction = inferFriction(text, effort);
  const mode = inferMode(text, pace, effort, friction);
  const canonicalKey = `${pace}:${slugify(text)}`;

  return {
    text,
    level: pace,
    mode,
    domain,
    effort,
    friction,
    pace,
    canonicalKey,
    canonical_key: canonicalKey,
    repetitionFamily: repetitionFamily(text, domain),
    repetition_family: repetitionFamily(text, domain),
    safetyReviewed: true,
    safety_reviewed: true,
  };
}

export const TASK_CATALOG = Object.entries(TASK_LIBRARY).flatMap(([pace, tasks]) =>
  tasks.map((text) => Object.freeze(taskMetadata(text, pace)))
);

export const TASK_METADATA_BY_TEXT = Object.freeze(
  TASK_CATALOG.reduce((map, task) => {
    map[normalizeText(task.text)] = task;
    return map;
  }, {})
);
