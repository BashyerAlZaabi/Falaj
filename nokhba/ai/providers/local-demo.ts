import type { AIProvider, CompletionRequest, CompletionResult, StreamChunk } from "../types";

/**
 * Offline demo provider. No network, no key: it answers from the structured context the
 * orchestrator passes (lesson text, retrieved chunks, learner profile, rubric…) using
 * rules and templates, so every AI workflow in the product stays functional in demos,
 * tests and CI. Replace by setting AI_PROVIDER=anthropic|openai|azure.
 */
type Ctx = Record<string, unknown>;

const sentences = (text: string) =>
  text
    .replace(/[#*`>_\[\]]/g, " ")
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 240);

const pickN = <T>(arr: T[], n: number, seed = 1) => {
  const out: T[] = [];
  const copy = [...arr];
  let s = seed;
  while (copy.length && out.length < n) {
    s = (s * 9301 + 49297) % 233280;
    out.push(copy.splice(Math.floor((s / 233280) * copy.length), 1)[0]);
  }
  return out;
};

const ar = (ctx: Ctx) => ctx.locale === "ar";
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const materialText = (ctx: Ctx) => [str(ctx.lessonText), str(ctx.retrievedText), str(ctx.courseSummary)].filter(Boolean).join("\n");
const lastUser = (req: CompletionRequest) => [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";

function tutorAnswer(req: CompletionRequest, ctx: Ctx): string {
  const q = lastUser(req).toLowerCase();
  const isAr = ar(ctx);
  const lesson = str(ctx.lessonTitle, isAr ? "هذا الدرس" : "this lesson");
  const sents = sentences(materialText(ctx));
  const key = sents.slice(0, 4);
  const guided = ctx.guidedMode === true;
  if (guided) {
    return isAr
      ? `سؤال جيد. قبل أن أجيب، دعنا نفكّر معاً: ما الذي تعتقد أن ${lesson} يحاول شرحه في جوهره؟\n\nتلميح: ${key[0] ?? "راجع أول فقرة في الدرس."}\n\nاكتب محاولتك وسأؤكّد لك أو أوجّهك.`
      : `Good question. Before I answer, let's think it through together: what do you think ${lesson} is fundamentally trying to explain?\n\nHint: ${key[0] ?? "Look at the first paragraph of the lesson."}\n\nWrite your attempt and I'll confirm or steer you.`;
  }
  if (/quiz|اختبر|اسأل/.test(q)) {
    const s = key[0] ?? (isAr ? "المفهوم الأساسي في الدرس" : "the core concept of the lesson");
    return isAr ? `لنبدأ باختبار قصير.\n\n**سؤال 1:** بكلماتك، اشرح: "${s}"\n\nأجب وسأقيّم إجابتك.` : `Let's do a quick check.\n\n**Question 1:** In your own words, explain: "${s}"\n\nAnswer and I'll grade it.`;
  }
  if (/summar|لخص|ملخص/.test(q)) {
    const bullets = key.map((s) => `- ${s}`).join("\n");
    return isAr ? `**ملخص ${lesson}:**\n${bullets}\n\n**أسئلة متوقعة:**\n1. ما الفكرة الرئيسية في الدرس؟\n2. متى تُطبَّق هذه الفكرة عملياً؟` : `**Summary of ${lesson}:**\n${bullets}\n\n**Likely exam questions:**\n1. What is the main idea of the lesson?\n2. When would you apply it in practice?`;
  }
  if (/example|مثال/.test(q)) {
    return isAr ? `**مثال عملي:** تخيّل فريقاً يطبّق ما في ${lesson} على مشكلة حقيقية في عمله.\n\n${key[1] ?? key[0] ?? ""}\n\nجرّب أن تصوغ مثالاً من مجالك أنت، وسأراجعه معك.` : `**Real-world example:** picture a team applying what ${lesson} teaches to a live problem at work.\n\n${key[1] ?? key[0] ?? ""}\n\nTry drafting an example from your own field and I'll review it with you.`;
  }
  if (/simpl|بسّط|ابسط|بسيط/.test(q)) {
    return isAr ? `**ببساطة:** ${key[0] ?? "الفكرة الأساسية هي فهم المشكلة قبل الحل."}\n\nفكّر فيها كخطوة واحدة صغيرة تُبنى عليها الخطوات التالية.` : `**Put simply:** ${key[0] ?? "The core idea is understanding the problem before the solution."}\n\nThink of it as one small step the next steps build on.`;
  }
  if (/weak|ضعف|ضعيف/.test(q)) {
    const weak = (ctx.weakSkills as Array<{ name: string; score: number }> | undefined) ?? [];
    const list = weak.map((w) => `- ${w.name}: ${w.score}%`).join("\n") || (isAr ? "- لا توجد بيانات كافية بعد" : "- Not enough data yet");
    return isAr ? `**أضعف مهاراتك حالياً:**\n${list}\n\nأقترح مراجعة دروس هذه المهارات ثم حل اختبار قصير.` : `**Your weakest skills right now:**\n${list}\n\nI'd suggest revisiting the lessons for these skills, then taking a short quiz.`;
  }
  const body = key.length ? key.map((s) => `- ${s}`).join("\n") : isAr ? "- ركّز على الفكرة الأولى في الدرس وطبّقها على مثال." : "- Focus on the lesson's first idea and apply it to an example.";
  return isAr ? `إليك ما يهم في **${lesson}**:\n${body}\n\nهل تريد مثالاً أو اختباراً قصيراً؟` : `Here's what matters in **${lesson}**:\n${body}\n\nWant an example or a quick quiz on this?`;
}

function companionAnswer(req: CompletionRequest, ctx: Ctx): string {
  const isAr = ar(ctx);
  const q = lastUser(req).toLowerCase();
  const name = str(ctx.learnerName, isAr ? "" : "");
  const courses = (ctx.activeCourses as Array<{ title: string; percent: number }> | undefined) ?? [];
  const weak = (ctx.weakSkills as Array<{ name: string; score: number }> | undefined) ?? [];
  const streak = Number(ctx.streakDays ?? 0);
  const top = courses.sort((a, b) => a.percent - b.percent)[0];
  if (/doing|progress|تقدم|كيف حالي|أدائي/.test(q)) {
    return isAr
      ? `${name ? `يا ${name}، ` : ""}أنت على سلسلة ${streak} يوم. ${courses.length ? `دوراتك النشطة: ${courses.map((c) => `${c.title} (${c.percent}%)`).join("، ")}.` : "لم تبدأ دورة بعد."}\n\n${weak.length ? `المهارات التي تحتاج تركيزاً: ${weak.map((w) => `${w.name} ${w.score}%`).join("، ")}.` : ""}\n\n**الخطوة التالية:** ${top ? `أكمل الدرس التالي في «${top.title}».` : "سجّل في دورة من المسار الموصى به."}`
      : `${name ? `${name}, ` : ""}you're on a ${streak}-day streak. ${courses.length ? `Active courses: ${courses.map((c) => `${c.title} (${c.percent}%)`).join(", ")}.` : "You haven't started a course yet."}\n\n${weak.length ? `Skills that need attention: ${weak.map((w) => `${w.name} ${w.score}%`).join(", ")}.` : ""}\n\n**Next step:** ${top ? `finish the next lesson in "${top.title}".` : "enrol in a course from your recommended path."}`;
  }
  if (/missing|gap|ناقص|أفتقد/.test(q) || /weak|ضعف/.test(q)) {
    return isAr ? `بناءً على اختباراتك ومشاريعك، أضعف المهارات: ${weak.map((w) => `**${w.name}** (${w.score}%)`).join("، ") || "لا توجد بيانات كافية بعد — أكمل اختباراً قصيراً أولاً"}.\n\nأقترح 20 دقيقة مراجعة يومياً لأضعف مهارة هذا الأسبوع.` : `Based on your quizzes and projects, your weakest skills are: ${weak.map((w) => `**${w.name}** (${w.score}%)`).join(", ") || "not enough data yet — take a short quiz first"}.\n\nI'd suggest 20 minutes a day on your weakest skill this week.`;
  }
  if (/plan|خطة|today|اليوم/.test(q)) {
    return isAr ? `**خطة اليوم (60 دقيقة):**\n- 15 د مراجعة ${weak[0]?.name ?? "المفاهيم الأساسية"}\n- 25 د الدرس التالي في ${top?.title ?? "دورتك"}\n- 10 د تمرين تطبيقي\n- 10 د اختبار قصير بالذكاء الاصطناعي\n\nابدأ من لوحتك الرئيسية بزر «ابدأ يومي التعليمي».` : `**Today's plan (60 min):**\n- 15 min review ${weak[0]?.name ?? "core concepts"}\n- 25 min next lesson in ${top?.title ?? "your course"}\n- 10 min practice exercise\n- 10 min AI quiz\n\nStart it from your dashboard with "Start My Learning Day".`;
  }
  if (/recommend|اقترح|رشح|course/.test(q)) {
    const recs = (ctx.catalogue as Array<{ id: string; title: string }> | undefined) ?? [];
    return isAr ? `أرشّح لك: ${recs.slice(0, 3).map((r) => `**${r.title}**`).join("، ") || "استكشف الكتالوج"}. اختر ما يقرّبك من هدفك: ${str(ctx.goal, "التطوير المهني")}.` : `I'd recommend: ${recs.slice(0, 3).map((r) => `**${r.title}**`).join(", ") || "explore the catalogue"}. Pick what moves you toward your goal: ${str(ctx.goal, "career development")}.`;
  }
  return isAr ? `يمكنني مساعدتك في: ماذا أدرس اليوم، كيف أدائي، ما المهارات الناقصة، بناء خطة دراسة، الاستعداد لاختبار، أو ترشيح دورة. اسألني عن أحدها.` : `I can help with: what to study today, how you're doing, which skills you're missing, building a study plan, preparing for an exam, or recommending a course. Ask me about any of those.`;
}

function quizJson(ctx: Ctx, count: number): string {
  const isAr = ar(ctx);
  const sents = sentences(materialText(ctx));
  const questions = pickN(sents, Math.max(count, 3), 7).slice(0, count).map((s, i) => {
    const distract = pickN(sents.filter((x) => x !== s), 3, i + 3);
    if (i % 3 === 1) return { type: "true_false", prompt: isAr ? `صح أم خطأ: ${s}` : `True or false: ${s}`, options: [{ id: "a", text: isAr ? "صح" : "True" }, { id: "b", text: isAr ? "خطأ" : "False" }], correctOptionIds: ["a"], explanation: isAr ? "هذه العبارة مأخوذة مباشرة من الدرس." : "This statement comes directly from the lesson.", difficulty: 1 + (i % 3), skill: str(ctx.lessonTitle, "General") };
    if (i % 3 === 2) return { type: "short_answer", prompt: isAr ? `بكلماتك، اشرح الفكرة التالية: "${s.slice(0, 80)}…"` : `In your own words, explain: "${s.slice(0, 80)}…"`, acceptedAnswers: [s], explanation: s, difficulty: 2 + (i % 3), skill: str(ctx.lessonTitle, "General") };
    const opts = [s, ...distract].map((t, j) => ({ id: "abcd"[j], text: t }));
    return { type: "multiple_choice", prompt: isAr ? `أيّ العبارات التالية صحيحة وفق الدرس؟` : `Which of the following is correct according to the lesson?`, options: pickN(opts, opts.length, i + 11), correctOptionIds: ["a"], explanation: s, difficulty: 1 + (i % 4), skill: str(ctx.lessonTitle, "General") };
  });
  return JSON.stringify({ questions });
}

function flashcardsJson(ctx: Ctx, count: number) {
  const isAr = ar(ctx);
  const sents = pickN(sentences(materialText(ctx)), count, 5);
  return JSON.stringify({ cards: sents.map((s, i) => ({ question: isAr ? `ما المقصود بـ: "${s.split(/[,،:]/)[0].slice(0, 60)}"؟` : `What is meant by: "${s.split(/[,:]/)[0].slice(0, 60)}"?`, answer: s, difficulty: ["easy", "medium", "hard"][i % 3], topic: str(ctx.lessonTitle, "General") })) });
}

function dailyPlanJson(ctx: Ctx, minutes: number) {
  const isAr = ar(ctx);
  const candidates = (ctx.planCandidates as Array<{ courseId: string; lessonId: string | null; title: string; href: string; kind: string }> | undefined) ?? [];
  const weak = (ctx.weakSkills as Array<{ name: string }> | undefined) ?? [];
  const lesson = candidates.find((c) => c.kind === "lesson");
  const review = candidates.find((c) => c.kind === "review") ?? lesson;
  const project = candidates.find((c) => c.kind === "project");
  const share = (f: number) => Math.max(5, Math.round((minutes * f) / 5) * 5);
  const items = [
    review && { kind: "review", minutes: share(0.25), title: isAr ? `مراجعة ${weak[0]?.name ?? review.title}` : `Review ${weak[0]?.name ?? review.title}`, courseId: review.courseId, lessonId: review.lessonId, href: review.href },
    lesson && { kind: "lesson", minutes: share(0.4), title: isAr ? `أكمل: ${lesson.title}` : `Complete: ${lesson.title}`, courseId: lesson.courseId, lessonId: lesson.lessonId, href: lesson.href },
    { kind: "practice", minutes: share(0.2), title: isAr ? "تمرين تطبيقي" : "Practice exercise", courseId: lesson?.courseId ?? null, lessonId: lesson?.lessonId ?? null, href: project?.href ?? lesson?.href ?? "/learn" },
    { kind: "quiz", minutes: share(0.15), title: isAr ? "اختبار قصير بالذكاء الاصطناعي" : "AI quiz", courseId: lesson?.courseId ?? null, lessonId: lesson?.lessonId ?? null, href: lesson ? `${lesson.href}?tab=quiz` : "/learn" },
  ].filter(Boolean);
  return JSON.stringify({ rationale: isAr ? `الخطة توازن بين مراجعة أضعف مهارة والتقدّم في الدورة الأكثر إلحاحاً ضمن ${minutes} دقيقة.` : `Balances your weakest skill with progress in your most urgent course within ${minutes} minutes.`, items });
}

function reviewJson(ctx: Ctx) {
  const isAr = ar(ctx);
  const rubric = (ctx.rubric as Array<{ id: string; title: string; weight: number; maxScore: number }> | undefined) ?? [];
  const text = str(ctx.submissionText);
  const links = (ctx.submissionLinks as string[] | undefined) ?? [];
  const words = text.split(/\s+/).filter(Boolean).length;
  const richness = Math.min(1, words / 250 + links.length * 0.15);
  const rows = rubric.map((r, i) => {
    const ratio = Math.max(0.35, Math.min(1, richness + ((i * 13) % 7) / 40));
    const score = Math.round(r.maxScore * ratio);
    return { criterionId: r.id, score, maxScore: r.maxScore, feedback: isAr ? (ratio > 0.75 ? `يستوفي «${r.title}» بوضوح؛ الدليل موجود في التسليم.` : `«${r.title}» مغطّى جزئياً: أضف تفاصيل وأمثلة ملموسة تُظهر كيف طبّقت المعيار.`) : ratio > 0.75 ? `Clearly meets "${r.title}"; the evidence is in the submission.` : `"${r.title}" is only partly covered: add concrete detail and examples showing how you applied it.` };
  });
  const total = rows.reduce((a, r) => a + r.score, 0);
  const max = rows.reduce((a, r) => a + r.maxScore, 0) || 1;
  const pass = total / max >= 0.7;
  return JSON.stringify({
    overall: pass ? "pass" : "revise",
    summary: isAr ? `التسليم ${pass ? "يحقق" : "لا يحقق بعد"} معايير المشروع (${Math.round((100 * total) / max)}%). ${words < 150 ? "الشرح مختصر جداً؛ وسّع التبرير." : "الشرح واضح ومنظّم."}` : `The submission ${pass ? "meets" : "does not yet meet"} the project bar (${Math.round((100 * total) / max)}%). ${words < 150 ? "The write-up is thin; expand your reasoning." : "The write-up is clear and organised."}`,
    rubric: rows,
    strengths: isAr ? ["التزام بالمطلوب في التسليم", links.length ? "إرفاق روابط قابلة للتحقق" : "بنية واضحة"] : ["Addresses the required deliverables", links.length ? "Verifiable links included" : "Clear structure"],
    improvements: isAr ? ["اربط كل قرار بمعيار من معايير التقييم", "أضف نتائج قابلة للقياس"] : ["Tie each decision to a rubric criterion", "Add measurable results"],
    revision: pass ? [] : isAr ? ["وسّع القسم الأضعف بمثال تطبيقي", "أعد التسليم بعد التعديل"] : ["Expand the weakest section with a worked example", "Resubmit after revising"],
  });
}

function courseJson(ctx: Ctx) {
  const topic = str(ctx.topic, "Applied AI");
  const level = str(ctx.level, "beginner");
  const modulesCount = Number(ctx.modules ?? 5);
  const modules = Array.from({ length: modulesCount }, (_, m) => ({
    titleEn: `Module ${m + 1}: ${["Foundations", "Core concepts", "Applied practice", "Advanced techniques", "Capstone and next steps", "Operations and governance"][m % 6]} of ${topic}`,
    titleAr: `الوحدة ${m + 1}: ${["الأساسيات", "المفاهيم الجوهرية", "التطبيق العملي", "تقنيات متقدمة", "المشروع الختامي والخطوات التالية", "التشغيل والحوكمة"][m % 6]} في ${topic}`,
    lessons: Array.from({ length: 3 }, (_, l) => ({
      titleEn: `${topic}: lesson ${m + 1}.${l + 1}`,
      titleAr: `${topic}: الدرس ${m + 1}.${l + 1}`,
      type: l === 2 ? "INTERACTIVE" : "TEXT",
      durationMinutes: 12 + l * 4,
      markdownEn: `## Why this matters\n\nThis lesson introduces a ${level}-level view of ${topic}. You will learn the vocabulary, see one worked example, and practise applying it.\n\n## Key ideas\n\n1. Start from the problem, not the tool.\n2. Measure before and after every change.\n3. Document decisions so others can review them.\n\n## Practice\n\nTake a task from your own work and describe how ${topic} would change your approach in three sentences.`,
      markdownAr: `## لماذا هذا مهم\n\nيقدّم هذا الدرس نظرة بمستوى ${level} على ${topic}. ستتعلّم المصطلحات، وترى مثالاً عملياً واحداً، وتتدرّب على التطبيق.\n\n## الأفكار الأساسية\n\n1. ابدأ من المشكلة لا من الأداة.\n2. قِس قبل كل تغيير وبعده.\n3. وثّق القرارات ليتمكّن الآخرون من مراجعتها.\n\n## تدريب\n\nخذ مهمة من عملك واشرح في ثلاث جمل كيف يغيّر ${topic} طريقتك.`,
    })),
  }));
  return JSON.stringify({
    titleEn: `${topic} for ${level}s`, titleAr: `${topic} لمستوى ${level}`,
    summaryEn: `A practical, project-based introduction to ${topic}.`, summaryAr: `مقدمة عملية قائمة على المشاريع في ${topic}.`,
    descriptionEn: `This course takes you from the fundamentals of ${topic} to a capstone you can show employers.`, descriptionAr: `تأخذك هذه الدورة من أساسيات ${topic} إلى مشروع ختامي يمكنك عرضه على أصحاب العمل.`,
    outcomesEn: [`Explain the core concepts of ${topic}`, `Apply ${topic} to a realistic scenario`, "Evaluate trade-offs and communicate decisions"],
    outcomesAr: [`شرح المفاهيم الأساسية في ${topic}`, `تطبيق ${topic} على سيناريو واقعي`, "تقييم المفاضلات وإيصال القرارات"],
    prerequisitesEn: ["Comfort with basic computer use"], prerequisitesAr: ["إلمام باستخدام الحاسوب"],
    skills: [topic, "Problem solving", "Communication"],
    modules,
    quizSuggestions: modules.map((_, i) => ({ moduleIndex: i, questions: [{ prompt: `What is the first step recommended in module ${i + 1}?`, options: ["Pick a tool", "Start from the problem", "Skip measurement", "Avoid documentation"], correctIndex: 1 }] })),
    projects: [{ titleEn: `${topic} capstone`, titleAr: `المشروع الختامي في ${topic}`, briefEn: `Apply ${topic} end-to-end to a problem from your organisation.`, briefAr: `طبّق ${topic} من البداية إلى النهاية على مشكلة من مؤسستك.`, deliverablesEn: ["Problem statement", "Solution design", "Results and reflection"], deliverablesAr: ["بيان المشكلة", "تصميم الحل", "النتائج والتأمل"] }],
    finalAssessment: { titleEn: `${topic} final assessment`, titleAr: `الاختبار النهائي في ${topic}`, questions: [{ prompt: `Which practice is emphasised throughout ${topic}?`, options: ["Measure before and after", "Never document", "Choose tools first", "Skip practice"], correctIndex: 0 }] },
  });
}

function skillsGapJson(ctx: Ctx) {
  const gaps = ((ctx.gaps as Array<{ skill: string; required: number; current: number }> | undefined) ?? []).map((g) => ({ ...g, priority: g.required - g.current >= 40 ? "high" : g.required - g.current >= 20 ? "medium" : "low" }));
  const catalogue = (ctx.catalogue as Array<{ id: string; title: string; skills: string[] }> | undefined) ?? [];
  const recommendations = gaps.slice(0, 4).flatMap((g) => catalogue.filter((c) => c.skills.some((s) => s.toLowerCase() === g.skill.toLowerCase())).slice(0, 1).map((c) => ({ courseId: c.id, why: `Closes the ${g.skill} gap (${g.current}% → ${g.required}% target).` })));
  return JSON.stringify({ summary: `${gaps.filter((g) => g.priority === "high").length} high-priority gaps; start with ${gaps[0]?.skill ?? "the largest gap"}.`, gaps, recommendations, planWeeks: Math.max(4, gaps.length * 2) });
}

export class LocalDemoProvider implements AIProvider {
  readonly id = "local";
  readonly label = "Built-in demo assistant (no API key)";
  readonly defaultModel = "nokhba-demo-1";

  private answer(req: CompletionRequest): string {
    const ctx = req.context ?? {};
    const isAr = ar(ctx);
    switch (req.action) {
      case "tutor.chat": return tutorAnswer(req, ctx);
      case "companion.chat": return companionAnswer(req, ctx);
      case "tutor.quiz": return quizJson(ctx, Number(ctx.count ?? 5));
      case "tutor.flashcards": return flashcardsJson(ctx, Number(ctx.count ?? 8));
      case "tutor.summary": { const k = sentences(materialText(ctx)).slice(0, 6).map((s) => `- ${s}`).join("\n"); return isAr ? `**ما يجب تذكّره:**\n${k}\n\n**أسئلة متوقعة:**\n1. ما الفكرة الرئيسية؟\n2. أين تُطبَّق؟\n3. ما الخطأ الشائع؟` : `**Remember:**\n${k}\n\n**Likely questions:**\n1. What is the main idea?\n2. Where is it applied?\n3. What is the common mistake?`; }
      case "plan.daily": return dailyPlanJson(ctx, Number(ctx.minutes ?? 60));
      case "plan.study": return JSON.stringify({ summary: isAr ? "خطة أربعة أسابيع تركّز على أضعف مهارتين ثم المشروع." : "A four-week plan focused on your two weakest skills, then the project.", weeks: [1, 2, 3, 4].map((w) => ({ week: w, focus: isAr ? `الأسبوع ${w}` : `Week ${w}`, tasks: [{ title: isAr ? "درسان + اختبار قصير" : "Two lessons + a short quiz", minutes: 120, courseId: str(ctx.primaryCourseId) || null }] })) });
      case "project.review": return reviewJson(ctx);
      case "assessment.feedback": { const score = Number(ctx.score ?? 0); const weak = (ctx.weakTopics as string[] | undefined) ?? []; return isAr ? `حصلت على ${score}%. ${score >= 70 ? "أداء جيد — أنت تفهم الأساسيات." : "لم تبلغ حد النجاح بعد، وهذا طبيعي في المحاولة الأولى."}\n\n**ركّز بعدها على:**\n${weak.map((w) => `- ${w}`).join("\n") || "- راجع الأسئلة الخاطئة وتفسيراتها"}` : `You scored ${score}%. ${score >= 70 ? "Solid work — you understand the fundamentals." : "Not at the pass mark yet, which is normal on a first attempt."}\n\n**Focus next:**\n${weak.map((w) => `- ${w}`).join("\n") || "- Revisit the questions you missed and their explanations"}`; }
      case "assessment.grade_short_answer": { const a = str(ctx.answer).toLowerCase(); const accepted = (ctx.acceptedAnswers as string[] | undefined) ?? []; const overlap = accepted.some((x) => { const words = x.toLowerCase().split(/\W+/).filter((w) => w.length > 3); return words.filter((w) => a.includes(w)).length >= Math.max(2, Math.ceil(words.length * 0.4)); }); return JSON.stringify({ score: overlap ? 1 : a.length > 20 ? 0.4 : 0, isCorrect: overlap, feedback: overlap ? (isAr ? "إجابة صحيحة تغطّي الفكرة الأساسية." : "Correct — you covered the key idea.") : isAr ? "الإجابة لا تذكر الفكرة الأساسية؛ راجع الدرس." : "The answer misses the key idea; revisit the lesson." }); }
      case "course.generate": return courseJson(ctx);
      case "code.help": { const mode = str(ctx.mode, "hint"); const code = str(ctx.code); const failing = str(ctx.failingTest); return isAr ? (mode === "solve" ? `الحل:\n\`\`\`\n${str(ctx.solution, code)}\n\`\`\`` : mode === "explain" ? `الكود يعرّف دالة ثم يعيد نتيجة بناءً على المدخلات. راجع كل سطر واسأل نفسك: ما مدخله وما مخرجه؟` : `**تلميح:** ${failing ? `الاختبار الفاشل يتوقع مخرجاً مختلفاً: ${failing}. تحقّق من حالة الحدود.` : "ابدأ بأصغر مدخل ممكن وتتبّع القيم يدوياً."}`) : mode === "solve" ? `Solution:\n\`\`\`\n${str(ctx.solution, code)}\n\`\`\`` : mode === "explain" ? `The code defines a function, then returns a result computed from its inputs. Walk each line asking: what comes in, what goes out?` : `**Hint:** ${failing ? `The failing test expects a different output: ${failing}. Check the edge case.` : "Start with the smallest possible input and trace the values by hand."}`; }
      case "notes.tool": { const tool = str(ctx.tool, "summarize"); const notes = str(ctx.notes); const s = sentences(notes); if (tool === "flashcards") return JSON.stringify({ cards: s.slice(0, 6).map((x, i) => ({ question: `${x.split(" ").slice(0, 6).join(" ")}…?`, answer: x, difficulty: ["easy", "medium", "hard"][i % 3], topic: "Notes" })) }); if (tool === "questions") return JSON.stringify({ questions: s.slice(0, 5).map((x) => ({ prompt: isAr ? `اشرح: ${x.slice(0, 60)}` : `Explain: ${x.slice(0, 60)}`, answer: x })) }); if (tool === "concepts") return JSON.stringify({ concepts: s.slice(0, 6).map((x) => ({ term: x.split(/[,،:]/)[0].slice(0, 40), definition: x })) }); if (tool === "study_guide") return `# ${isAr ? "دليل المذاكرة" : "Study guide"}\n\n${s.slice(0, 6).map((x, i) => `## ${i + 1}. ${x.split(" ").slice(0, 5).join(" ")}\n${x}`).join("\n\n")}\n\n## ${isAr ? "قائمة التحقق" : "Checklist"}\n${s.slice(0, 4).map((x) => `- [ ] ${x.slice(0, 50)}`).join("\n")}`; if (tool === "organize") return s.map((x, i) => `### ${isAr ? "نقطة" : "Point"} ${i + 1}\n${x}`).join("\n\n"); return s.slice(0, 5).map((x) => `- ${x}`).join("\n") || notes.slice(0, 300); }
      case "search.answer": { const s = sentences(str(ctx.retrievedText)).slice(0, 3); return s.length ? (isAr ? `وفق المحتوى التعليمي:\n${s.map((x) => `- ${x}`).join("\n")}` : `According to the learning content:\n${s.map((x) => `- ${x}`).join("\n")}`) : isAr ? "لم أجد محتوى مطابقاً في الدورات. جرّب كلمات أخرى." : "I couldn't find matching course content. Try different words."; }
      case "skills.gap": return skillsGapJson(ctx);
      case "memory.summarize": return req.messages.filter((m) => m.role === "user").slice(-4).map((m) => m.content.slice(0, 80)).join(" | ");
      case "recommend.explain": { const recs = (ctx.recommended as Array<{ courseId: string; title: string; skill?: string }> | undefined) ?? []; return JSON.stringify({ reasons: recs.map((r) => ({ courseId: r.courseId, reason: isAr ? `يقوّي ${r.skill ?? "مهارة"} ويقرّبك من هدفك.` : `Strengthens ${r.skill ?? "a key skill"} and moves you toward your goal.` })) }); }
      default: return isAr ? "لا أستطيع المساعدة في هذا الطلب." : "I can't help with that request.";
    }
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const started = Date.now();
    const text = this.answer(req);
    return { text, model: this.defaultModel, provider: this.id, usage: { inputTokens: Math.ceil((req.system.length + req.messages.reduce((a, m) => a + m.content.length, 0)) / 4), outputTokens: Math.ceil(text.length / 4) }, latencyMs: Date.now() - started };
  }

  async stream(req: CompletionRequest, onDelta: (c: StreamChunk) => void): Promise<CompletionResult> {
    const result = await this.complete(req);
    // Stream word by word so the UI's streaming path is exercised in demos.
    const words = result.text.split(/(\s+)/);
    for (const w of words) {
      if (req.signal?.aborted) break;
      onDelta({ delta: w });
      await new Promise((r) => setTimeout(r, 8));
    }
    return result;
  }

  async ping() {
    return { ok: true, detail: "demo mode" };
  }
}
