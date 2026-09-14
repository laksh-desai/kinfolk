import { connectionSteps, NEW_PERSON, type ConnectionStep, type RelationKey, type Via } from '@kinfolk/shared/relatives/planAddRelative';
import type { TreeGraph } from '@kinfolk/shared/schemas/graph';

export type ConnectionAnswers = Partial<Record<keyof Via, string>>;

export interface ResolvedConnection {
  via: Via;
  steps: ConnectionStep[];
  needsParentKind: boolean;
}

/**
 * Turns the user's answers so far into a complete `via`, filling each unanswered question with
 * its first option so the form is always submittable, and re-asking follow-up questions that
 * depend on earlier answers ("Which aunt or uncle?" depends on which parent's side).
 */
export function resolveConnection(
  graph: TreeGraph,
  anchorId: string,
  relation: RelationKey,
  answers: ConnectionAnswers,
  siblingInLawVia: 'partner' | 'sibling' = 'partner',
): ResolvedConnection {
  const relevant = (steps: ConnectionStep[]) =>
    relation === 'sibling-in-law' ? steps.filter((step) => step.key === (siblingInLawVia === 'sibling' ? 'siblingId' : 'partnerId')) : steps;
  let via: Via = {};
  let result = connectionSteps(graph, anchorId, relation, via);
  for (let round = 0; round < 4; round += 1) {
    let changed = false;
    for (const step of relevant(result.steps)) {
      const answer = answers[step.key];
      const valid = answer !== undefined && ((answer === NEW_PERSON && step.allowsNew) || step.options.some((option) => option.id === answer));
      const value = valid ? answer : (step.options[0]?.id ?? NEW_PERSON);
      if (via[step.key] !== value) {
        via = { ...via, [step.key]: value };
        changed = true;
      }
    }
    if (!changed) break;
    result = connectionSteps(graph, anchorId, relation, via);
  }
  return { via, steps: relevant(result.steps), needsParentKind: result.needsParentKind };
}
