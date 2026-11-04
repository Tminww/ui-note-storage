/** Save first, then enrich. Provider failure NEVER loses the original note. */
export function createPipeline({ repository, ai }) {
  return async function processThought(id) {
    const initial = repository.getThought(id);
    if (!initial) return null;
    const settings = repository.getSettings();
    const projects = repository.listProjects();
    const categories = repository.getCategories?.() || [];
    repository.updateThought(id, { status: 'processing', errorMessage: null });
    let decision = null, generated = null;
    const warnings = [];
    // Parallel calls avoid doubling latency; both are optional enrichments.
    const [decisionResult, generateResult] = await Promise.allSettled([
      ai.classify(settings, initial.rawText, projects, initial.projectLocked ? initial.projectId : null, categories, initial.categoryLocked ? initial.category : null),
      ai.generate(settings, initial.rawText)
    ]);
    if (decisionResult.status === 'fulfilled') decision = decisionResult.value;
    else warnings.push(`Jev: ${decisionResult.reason?.message || 'неизвестная ошибка'}`);
    if (generateResult.status === 'fulfilled') generated = generateResult.value;
    else warnings.push(`LLM: ${generateResult.reason?.message || 'неизвестная ошибка'}`);

    // A manual project assignment is never overridden by an AI decision.
    const projectId = initial.projectLocked ? initial.projectId : decision?.projectConfidence >= settings.confidenceThreshold ? decision?.projectId ?? null : null;
    const confidence = decision
      ? Math.min(decision.categoryConfidence, (initial.projectLocked || !projects.length) ? 1 : decision.projectConfidence)
      : null;
    let status;
    if (!decision && !generated) status = 'pending';
    else if (!decision || !generated || !projectId || confidence < settings.confidenceThreshold) status = 'needs_review';
    else status = 'ready';
    let classificationProposal = null;
    const unresolved = {
      project: !initial.projectLocked && !projectId,
      category: !initial.categoryLocked && (!decision?.category || decision.categoryConfidence < settings.confidenceThreshold)
    };
    if (repository.getCategories && ai.suggest && settings.decisionProvider !== 'disabled' && (unresolved.project || unresolved.category)) {
      try {
        classificationProposal = await ai.suggest(settings, initial.rawText, { projects, types: [
          { name: 'Идея', description: 'Предложение или улучшение' }, { name: 'Задача', description: 'Конкретное действие' },
          { name: 'Ошибка', description: 'Неисправность' }, { name: 'Исследование', description: 'Вопрос или гипотеза' },
          { name: 'Заметка', description: 'Наблюдение или размышление' }, ...categories
        ], unresolved });
        status = 'needs_review';
      } catch (error) { warnings.push(`Предложение DeepSeek: ${error.message}`); }
    }
    return repository.updateThought(id, {
      title: generated?.title || initial.title,
      summary: generated?.summary || initial.summary,
      tags: generated?.tags || initial.tags,
      projectId,
      category: initial.categoryLocked ? initial.category : decision?.category || initial.category,
      classificationProposal,
      status, confidence,
      errorMessage: warnings.length ? warnings.join(' | ').slice(0, 650) : null,
      generatorModel: generated ? `${settings.generatorProvider}:${settings.generatorModel}` : null,
      decisionModel: decision ? `${settings.decisionProvider}:${settings.decisionModel}` : null
    });
  };
}
