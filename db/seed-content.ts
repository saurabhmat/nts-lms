/**
 * Placeholder onboarding content: the psychometric assessment, the setup questionnaire and
 * the analysis bands.
 *
 * This exists so the onboarding funnel can be built and exercised before the trainer's real
 * workbook arrives. It is deliberately written to the same tables the spreadsheet importer
 * writes to (`lib/import/commit.ts`), so importing the real `Psychometric` and
 * `Setup_Questionnaire` tabs later *replaces* this content rather than sitting alongside it.
 * Nothing here is meant to survive to launch -- see docs/plan.md.
 *
 * Run with: npm run db:seed:content   (add --force to overwrite after learners have answered)
 */
import { eq, inArray } from "drizzle-orm";

import { getDb } from "./index";
import { analyses, analysisBands, attempts, questionSets, questions, setupAnswers } from "./schema";

type SeedQuestion = {
  order: number;
  promptEn: string;
  promptHi: string;
  trait: string;
  options: Array<{ key: string; en: string; hi: string; score: number }>;
};

// Scored 0-3, where 3 is the strongest sales behaviour. The engine sums the chosen options
// and measures them against the best-scoring option per question, so a learner who picks the
// strongest answer every time scores 100%.
const PSYCHOMETRIC: SeedQuestion[] = [
  {
    order: 1,
    trait: "discovery",
    promptEn: "You are on a first call with a prospect. What do you spend most of the call doing?",
    promptHi: "आप एक संभावित ग्राहक के साथ पहली कॉल पर हैं। आप कॉल का अधिकांश समय क्या करने में बिताते हैं?",
    options: [
      { key: "A", en: "Presenting the product and its features", hi: "उत्पाद और उसकी विशेषताएँ प्रस्तुत करना", score: 1 },
      { key: "B", en: "Asking questions to understand their situation and problems", hi: "उनकी स्थिति और समस्याओं को समझने के लिए प्रश्न पूछना", score: 3 },
      { key: "C", en: "Explaining why you are better than the competition", hi: "यह समझाना कि आप प्रतिस्पर्धा से बेहतर क्यों हैं", score: 0 },
      { key: "D", en: "Talking about pricing and available discounts", hi: "कीमत और उपलब्ध छूट के बारे में बात करना", score: 0 },
    ],
  },
  {
    order: 2,
    trait: "objection_handling",
    promptEn: "A prospect says \"your price is too high\". What is your first response?",
    promptHi: "एक संभावित ग्राहक कहता है \"आपकी कीमत बहुत ज़्यादा है\"। आपकी पहली प्रतिक्रिया क्या होगी?",
    options: [
      { key: "A", en: "Offer a discount straight away to keep the deal alive", hi: "सौदा बचाने के लिए तुरंत छूट दे देना", score: 0 },
      { key: "B", en: "Ask what they are comparing the price against", hi: "पूछना कि वे इस कीमत की तुलना किससे कर रहे हैं", score: 3 },
      { key: "C", en: "Repeat the list of features to justify the price", hi: "कीमत को सही ठहराने के लिए विशेषताओं की सूची दोहराना", score: 1 },
      { key: "D", en: "Accept it and move on to another prospect", hi: "इसे स्वीकार करके किसी दूसरे ग्राहक की ओर बढ़ जाना", score: 0 },
    ],
  },
  {
    order: 3,
    trait: "resilience",
    promptEn: "You lose five deals in a row. What do you do next?",
    promptHi: "आप लगातार पाँच सौदे हार जाते हैं। इसके बाद आप क्या करते हैं?",
    options: [
      { key: "A", en: "Review what happened in each one and look for a pattern", hi: "हर सौदे की समीक्षा करके कोई साझा पैटर्न ढूँढ़ना", score: 3 },
      { key: "B", en: "Push harder and make more calls without changing anything", hi: "बिना कुछ बदले और ज़्यादा मेहनत और कॉल करना", score: 1 },
      { key: "C", en: "Assume the leads were poor quality", hi: "यह मान लेना कि लीड्स की गुणवत्ता ही खराब थी", score: 0 },
      { key: "D", en: "Ask a senior colleague to sit in on your next call", hi: "किसी वरिष्ठ सहकर्मी से अगली कॉल में साथ बैठने को कहना", score: 2 },
    ],
  },
  {
    order: 4,
    trait: "prospecting",
    promptEn: "Your pipeline is full this month. How much time do you spend prospecting?",
    promptHi: "इस महीने आपकी पाइपलाइन भरी हुई है। आप नए ग्राहक खोजने में कितना समय देते हैं?",
    options: [
      { key: "A", en: "None -- you focus on closing what is already there", hi: "बिल्कुल नहीं — आप मौजूदा सौदों को बंद करने पर ध्यान देते हैं", score: 0 },
      { key: "B", en: "The same amount as every other month", hi: "हर दूसरे महीने जितना ही समय", score: 3 },
      { key: "C", en: "A little, only if you have spare time at the end of the week", hi: "थोड़ा-सा, केवल तब जब सप्ताह के अंत में समय बचे", score: 1 },
      { key: "D", en: "You restart prospecting once the pipeline starts to empty", hi: "पाइपलाइन खाली होने लगे तब दोबारा शुरू करते हैं", score: 1 },
    ],
  },
  {
    order: 5,
    trait: "listening",
    promptEn: "In a typical sales conversation, roughly how much of the talking do you do?",
    promptHi: "एक सामान्य बिक्री बातचीत में, लगभग कितना बोलना आपकी ओर से होता है?",
    options: [
      { key: "A", en: "About 30% -- the customer talks most of the time", hi: "लगभग 30% — ज़्यादातर समय ग्राहक बोलता है", score: 3 },
      { key: "B", en: "About half each", hi: "लगभग आधा-आधा", score: 2 },
      { key: "C", en: "About 70% -- you need to explain the offering properly", hi: "लगभग 70% — आपको अपनी पेशकश ठीक से समझानी होती है", score: 1 },
      { key: "D", en: "Almost all of it -- that is what a sales pitch is", hi: "लगभग पूरा — बिक्री प्रस्तुति का यही मतलब है", score: 0 },
    ],
  },
  {
    order: 6,
    trait: "follow_up",
    promptEn: "A prospect does not reply to your follow-up email. What happens next?",
    promptHi: "एक संभावित ग्राहक आपके फॉलो-अप ईमेल का जवाब नहीं देता। आगे क्या होता है?",
    options: [
      { key: "A", en: "You mark them as not interested and move on", hi: "आप उन्हें अरुचिकर मानकर आगे बढ़ जाते हैं", score: 0 },
      { key: "B", en: "You follow up on a planned schedule with something useful each time", hi: "आप एक तय समय-सारणी पर हर बार कुछ उपयोगी देकर फॉलो-अप करते हैं", score: 3 },
      { key: "C", en: "You send the same message again a few times", hi: "आप वही संदेश कुछ बार दोबारा भेजते हैं", score: 1 },
      { key: "D", en: "You wait for them to come back to you when they are ready", hi: "आप इंतज़ार करते हैं कि वे तैयार होने पर खुद संपर्क करें", score: 0 },
    ],
  },
  {
    order: 7,
    trait: "closing",
    promptEn: "When do you first talk about next steps and committing to a decision?",
    promptHi: "आप अगले कदमों और निर्णय पर प्रतिबद्धता की बात सबसे पहले कब करते हैं?",
    options: [
      { key: "A", en: "At the very end, once everything has been presented", hi: "बिल्कुल अंत में, सब कुछ प्रस्तुत कर देने के बाद", score: 1 },
      { key: "B", en: "Early, and you agree the next step at the end of every conversation", hi: "शुरुआत में ही, और हर बातचीत के अंत में अगला कदम तय करते हैं", score: 3 },
      { key: "C", en: "Only when the customer raises it themselves", hi: "केवल तब जब ग्राहक स्वयं इसका ज़िक्र करे", score: 0 },
      { key: "D", en: "After the proposal has been sent", hi: "प्रस्ताव भेजने के बाद", score: 1 },
    ],
  },
  {
    order: 8,
    trait: "coachability",
    promptEn: "Your manager gives you critical feedback after listening to your call. You:",
    promptHi: "आपकी कॉल सुनने के बाद आपका प्रबंधक आलोचनात्मक प्रतिक्रिया देता है। आप:",
    options: [
      { key: "A", en: "Ask for specifics and try the change on your next call", hi: "विशिष्ट बातें पूछते हैं और अगली कॉल में वह बदलाव आज़माते हैं", score: 3 },
      { key: "B", en: "Explain why the call went the way it did", hi: "समझाते हैं कि कॉल वैसी क्यों रही", score: 1 },
      { key: "C", en: "Accept it politely but keep working your own way", hi: "विनम्रता से मान लेते हैं पर अपने तरीके से ही काम करते रहते हैं", score: 0 },
      { key: "D", en: "Note it down and review it at the end of the quarter", hi: "उसे लिख लेते हैं और तिमाही के अंत में समीक्षा करते हैं", score: 1 },
    ],
  },
  {
    order: 9,
    trait: "business_understanding",
    promptEn: "Before a meeting with a new company, what do you prepare?",
    promptHi: "किसी नई कंपनी के साथ बैठक से पहले आप क्या तैयारी करते हैं?",
    options: [
      { key: "A", en: "Your standard presentation deck", hi: "अपनी सामान्य प्रस्तुति", score: 1 },
      { key: "B", en: "Their business, their market and who else they buy from", hi: "उनका व्यवसाय, उनका बाज़ार और वे और किनसे खरीदते हैं", score: 3 },
      { key: "C", en: "A price list and the current offers", hi: "मूल्य सूची और मौजूदा ऑफ़र", score: 0 },
      { key: "D", en: "Nothing specific -- you adapt during the meeting", hi: "कुछ खास नहीं — आप बैठक के दौरान ढल जाते हैं", score: 0 },
    ],
  },
  {
    order: 10,
    trait: "deal_management",
    promptEn: "A deal you were confident about has gone quiet for three weeks. What do you do?",
    promptHi: "जिस सौदे को लेकर आप आश्वस्त थे, वह तीन हफ़्तों से शांत है। आप क्या करते हैं?",
    options: [
      { key: "A", en: "Keep it in the forecast and hope it closes", hi: "उसे पूर्वानुमान में बनाए रखते हैं और उम्मीद करते हैं कि बंद हो जाए", score: 0 },
      { key: "B", en: "Contact your champion and ask directly where it stands", hi: "अपने समर्थक से संपर्क कर सीधे पूछते हैं कि स्थिति क्या है", score: 3 },
      { key: "C", en: "Offer a time-limited discount to force a decision", hi: "निर्णय के लिए दबाव बनाने हेतु सीमित समय की छूट देते हैं", score: 1 },
      { key: "D", en: "Remove it from the forecast without asking", hi: "बिना पूछे उसे पूर्वानुमान से हटा देते हैं", score: 0 },
    ],
  },
];

// Free-text questions carry an empty options array. The setup questionnaire is unscored and
// its answers live in `setup_answers`, never in the scored `responses` table -- see the
// amendment in docs/spec.md §4.
const SETUP: Array<{ order: number; promptEn: string; promptHi: string; options: Array<{ key: string; en: string; hi: string }> }> = [
  {
    order: 1,
    promptEn: "What do you sell, and to whom?",
    promptHi: "आप क्या बेचते हैं, और किसे बेचते हैं?",
    options: [],
  },
  {
    order: 2,
    promptEn: "How large is your sales team?",
    promptHi: "आपकी बिक्री टीम कितनी बड़ी है?",
    options: [
      { key: "A", en: "Just me", hi: "केवल मैं" },
      { key: "B", en: "2 to 5 people", hi: "2 से 5 लोग" },
      { key: "C", en: "6 to 20 people", hi: "6 से 20 लोग" },
      { key: "D", en: "More than 20 people", hi: "20 से अधिक लोग" },
    ],
  },
  {
    order: 3,
    promptEn: "Where do most of your leads come from today?",
    promptHi: "आज आपकी अधिकांश लीड्स कहाँ से आती हैं?",
    options: [
      { key: "A", en: "Referrals and word of mouth", hi: "रेफ़रल और मौखिक प्रचार" },
      { key: "B", en: "Cold calling and outreach", hi: "कोल्ड कॉलिंग और आउटरीच" },
      { key: "C", en: "Online marketing and social media", hi: "ऑनलाइन मार्केटिंग और सोशल मीडिया" },
      { key: "D", en: "Walk-ins and existing customers", hi: "वॉक-इन और मौजूदा ग्राहक" },
    ],
  },
  {
    order: 4,
    promptEn: "What is your typical deal size?",
    promptHi: "आपके सौदे का सामान्य आकार क्या है?",
    options: [
      { key: "A", en: "Under Rs 50,000", hi: "50,000 रुपये से कम" },
      { key: "B", en: "Rs 50,000 to Rs 5 lakh", hi: "50,000 से 5 लाख रुपये" },
      { key: "C", en: "Rs 5 lakh to Rs 50 lakh", hi: "5 लाख से 50 लाख रुपये" },
      { key: "D", en: "Above Rs 50 lakh", hi: "50 लाख रुपये से अधिक" },
    ],
  },
  {
    order: 5,
    promptEn: "What is the single biggest problem in your sales process right now?",
    promptHi: "अभी आपकी बिक्री प्रक्रिया में सबसे बड़ी समस्या क्या है?",
    options: [],
  },
  {
    order: 6,
    promptEn: "What would you like to be different by the end of this course?",
    promptHi: "इस कोर्स के अंत तक आप क्या बदला हुआ देखना चाहेंगे?",
    options: [],
  },
];

// Contiguous cover from 0 to 100 so every possible score matches a band. Boundaries overlap
// by design (a score of exactly 60 matches two); the engine resolves that by taking the
// highest matching band.
const BANDS = [
  {
    minPct: 0,
    maxPct: 40,
    label: "Developing",
    bodyEn:
      "Your answers suggest you are early in building a repeatable sales approach. The habits that matter most for you right now are asking questions before presenting, and following up on a schedule rather than when you remember. Work through the chapters in order and apply one change at a time.",
    bodyHi:
      "आपके उत्तर बताते हैं कि आप एक दोहराई जा सकने वाली बिक्री पद्धति बनाने के शुरुआती चरण में हैं। इस समय आपके लिए सबसे ज़रूरी आदतें हैं — प्रस्तुति से पहले प्रश्न पूछना, और याद आने पर नहीं बल्कि एक तय समय-सारणी पर फॉलो-अप करना। अध्यायों को क्रम से पढ़ें और एक बार में एक बदलाव लागू करें।",
  },
  {
    minPct: 40,
    maxPct: 60,
    label: "Emerging",
    bodyEn:
      "You have the basics in place and win deals, but the results still depend on effort more than process. Your biggest gains will come from qualifying earlier and agreeing a clear next step at the end of every conversation, so fewer deals go quiet.",
    bodyHi:
      "आपके पास बुनियादी बातें हैं और आप सौदे जीतते भी हैं, पर परिणाम अभी प्रक्रिया से ज़्यादा मेहनत पर निर्भर हैं। सबसे बड़ा लाभ आपको जल्दी योग्यता जाँचने और हर बातचीत के अंत में स्पष्ट अगला कदम तय करने से मिलेगा, ताकि कम सौदे ठंडे पड़ें।",
  },
  {
    minPct: 60,
    maxPct: 80,
    label: "Proficient",
    bodyEn:
      "You run a solid process: you discover before you pitch, and you manage deals rather than hope for them. Focus now on the harder conversations -- pricing without discounting, and reopening deals that have stalled -- which is where most of your remaining upside sits.",
    bodyHi:
      "आप एक मज़बूत प्रक्रिया पर चलते हैं: आप प्रस्तुति से पहले समझते हैं, और सौदों को उम्मीद पर नहीं बल्कि प्रबंधन से आगे बढ़ाते हैं। अब कठिन बातचीत पर ध्यान दें — बिना छूट दिए कीमत पर बात करना, और रुके हुए सौदों को फिर से शुरू करना — यहीं आपकी बची हुई सबसे बड़ी संभावना है।",
  },
  {
    minPct: 80,
    maxPct: 100,
    label: "Advanced",
    bodyEn:
      "Your answers reflect a disciplined, customer-first approach that most salespeople take years to build. Use this course to sharpen edges rather than rebuild foundations, and to turn what you do instinctively into something you can teach the rest of your team.",
    bodyHi:
      "आपके उत्तर एक अनुशासित, ग्राहक-केंद्रित दृष्टिकोण दर्शाते हैं, जिसे बनाने में अधिकांश विक्रेताओं को वर्षों लगते हैं। इस कोर्स का उपयोग नींव दोबारा बनाने के लिए नहीं, बल्कि धार तेज़ करने के लिए करें — और जो आप सहज रूप से करते हैं उसे ऐसा बनाएँ कि अपनी टीम को सिखा सकें।",
  },
];

async function upsertSet(type: "psychometric" | "setup", title: string) {
  const db = getDb();
  const [existing] = await db.select().from(questionSets).where(eq(questionSets.type, type)).limit(1);
  if (existing) {
    await db.update(questionSets).set({ title }).where(eq(questionSets.id, existing.id));
    return existing.id;
  }
  const [created] = await db.insert(questionSets).values({ type, title, chapterId: null }).returning();
  return created.id;
}

async function main() {
  const force = process.argv.includes("--force");
  const db = getDb();

  // Replacing questions cascades to responses and setup_answers, so a re-seed after learners
  // have answered would silently destroy their data. The importer refuses the same way.
  const existingSets = await db
    .select({ id: questionSets.id })
    .from(questionSets)
    .where(inArray(questionSets.type, ["psychometric", "setup"]));

  if (existingSets.length > 0 && !force) {
    const setIds = existingSets.map((set) => set.id);
    const attempted = await db
      .select({ id: attempts.id })
      .from(attempts)
      .where(inArray(attempts.setId, setIds))
      .limit(1);
    const answered = await db.select({ userId: setupAnswers.userId }).from(setupAnswers).limit(1);

    if (attempted.length > 0 || answered.length > 0) {
      console.error(
        "Refusing to re-seed: learners have already answered these questions, and replacing\n" +
          "them would delete those answers. Re-run with --force if that is what you want.",
      );
      process.exit(1);
    }
  }

  const psychometricSetId = await upsertSet("psychometric", "Sales Psychometric Assessment");
  await db.delete(questions).where(eq(questions.setId, psychometricSetId));
  await db.insert(questions).values(
    PSYCHOMETRIC.map((question) => ({
      setId: psychometricSetId,
      order: question.order,
      promptEn: question.promptEn,
      promptHi: question.promptHi,
      options: question.options.map(({ key, en, hi }) => ({ key, en, hi })),
      correctOption: null,
      trait: question.trait,
      optionScores: Object.fromEntries(question.options.map((option) => [option.key, option.score])),
    })),
  );

  const setupSetId = await upsertSet("setup", "Your Current Sales Setup");
  await db.delete(questions).where(eq(questions.setId, setupSetId));
  await db.insert(questions).values(
    SETUP.map((question) => ({
      setId: setupSetId,
      order: question.order,
      promptEn: question.promptEn,
      promptHi: question.promptHi,
      options: question.options,
      correctOption: null,
      trait: null,
      optionScores: null,
    })),
  );

  // Same sequence as the importer (lib/import/commit.ts): insert the new bands, re-point every
  // existing analysis at whichever new band covers its score, then drop the old rows. A score
  // no new band covers falls to null via ON DELETE SET NULL, which the analysis screen renders
  // as "no written analysis for this range yet". The learner's score is never lost.
  const oldBandIds = (await db.select({ id: analysisBands.id }).from(analysisBands)).map((band) => band.id);

  const newBands = await db
    .insert(analysisBands)
    .values(BANDS)
    .returning({ id: analysisBands.id, minPct: analysisBands.minPct, maxPct: analysisBands.maxPct });

  if (oldBandIds.length > 0) {
    const affected = await db
      .select({ id: analyses.id, score: analyses.psychometricScore })
      .from(analyses)
      .where(inArray(analyses.bandId, oldBandIds));

    for (const row of affected) {
      const match = newBands
        .filter((band) => band.minPct <= row.score && band.maxPct >= row.score)
        .sort((a, b) => b.minPct - a.minPct)[0];
      await db.update(analyses).set({ bandId: match?.id ?? null }).where(eq(analyses.id, row.id));
    }

    await db.delete(analysisBands).where(inArray(analysisBands.id, oldBandIds));
  }

  const maxScore = PSYCHOMETRIC.reduce(
    (total, question) => total + Math.max(...question.options.map((option) => option.score)),
    0,
  );

  console.log(
    `Seeded placeholder onboarding content:\n` +
      `  psychometric : ${PSYCHOMETRIC.length} questions (max score ${maxScore})\n` +
      `  setup        : ${SETUP.length} questions (${SETUP.filter((q) => q.options.length === 0).length} free-text)\n` +
      `  bands        : ${BANDS.length}\n\n` +
      `This is placeholder content. Importing the trainer's workbook replaces it.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
