/**
 * SOI Intelligence Core — Operational Answer Generator
 *
 * Generates structured, contextual answers from operational state
 * and parsed question intent. All reasoning is deterministic.
 * No LLM. No probabilistic claims.
 */

import type { OperationalAssessment, ZoneAssessment } from './operational-reasoning';
import type { SoiRecommendation } from './recovery-recommendations';
import type { DispatchPlan } from './dispatch-optimizer';
import type { RoutedQuestion } from './operational-question-router';

// ============================================================
// TYPES
// ============================================================

export interface CopilotAnswer {
  title: string;
  answer: string;
  confidence: 'low' | 'moderate' | 'high';
  bullets: string[];
  assumptions: string[];
  recommendedNextAction?: string;
  source: 'deterministic_operational_model';
}

// ============================================================
// CONTEXT
// ============================================================

export interface OperationalContext {
  assessment: OperationalAssessment;
  recommendations: readonly SoiRecommendation[];
  dispatchPlan: DispatchPlan;
  activeIncidentCount: number;
  activeRecoveryCount: number;
}

// ============================================================
// GENERATOR
// ============================================================

export function generateAnswer(
  question: RoutedQuestion,
  ctx: OperationalContext,
): CopilotAnswer {
  switch (question.intent) {
    case 'stability_timing':
      return answerStabilityTiming(question, ctx);
    case 'cause_explanation':
      return answerCauseExplanation(question, ctx);
    case 'risk_assessment':
      return answerRiskAssessment(question, ctx);
    case 'recovery_plan':
      return answerRecoveryPlan(question, ctx);
    case 'resource_question':
      return answerResourceQuestion(question, ctx);
    case 'summary':
      return answerSummary(ctx);
    default:
      return {
        title: 'Unable to interpret',
        answer: "I don't have enough context to answer that. Try asking about stability timing, risks, recovery plans, or operational status.",
        confidence: 'low',
        bullets: [
          'Try: "how long until full stability"',
          'Try: "what is our biggest risk"',
          'Try: "what should we do"',
          'Try: "give me the situation"',
        ],
        assumptions: [],
        source: 'deterministic_operational_model',
      };
  }
}

// ============================================================
// INTENT HANDLERS
// ============================================================

function answerStabilityTiming(q: RoutedQuestion, ctx: OperationalContext): CopilotAnswer {
  const { assessment, recommendations, dispatchPlan } = ctx;

  // Focus on target zone or worst zone
  const targetZone = q.targetZone
    ? assessment.zoneAssessments.find(z => z.zoneId === q.targetZone)
    : getWorstZone(assessment);

  if (!targetZone || assessment.globalStability === 'stable') {
    return {
      title: 'Stability Estimate',
      answer: 'Operation is currently stable. No significant instability detected.',
      confidence: 'high',
      bullets: [`Global pressure: ${assessment.globalPressure}/100`, `Active incidents: ${ctx.activeIncidentCount}`],
      assumptions: [],
      source: 'deterministic_operational_model',
    };
  }

  // Estimate stabilization from dispatch plan and zone state
  const estMin = dispatchPlan.totalEstimatedMinutes > 0
    ? dispatchPlan.totalEstimatedMinutes
    : estimateFromZone(targetZone);
  const rangeMin = Math.round(estMin * 0.75);
  const rangeMax = Math.round(estMin * 1.35);

  const blockers: string[] = [];
  for (const ps of targetZone.pressureSources.slice(0, 3)) {
    blockers.push(ps.description);
  }

  const confidence = targetZone.pressure >= 80 ? 'moderate' as const
    : targetZone.pressure >= 50 ? 'moderate' as const : 'high' as const;

  return {
    title: 'Stabilization Estimate',
    answer: `Modeled full-stability estimate: ${rangeMin}–${rangeMax} minutes.${q.targetZone ? ` Focused on ${targetZone.zoneLabel}.` : ''} Main dependency: reducing ${targetZone.zoneLabel} unresolved backlog (${targetZone.unresolvedCount} incidents).`,
    confidence,
    bullets: [
      `${targetZone.zoneLabel}: pressure ${targetZone.pressure}/100 (${targetZone.stability})`,
      `${targetZone.unresolvedCount} unresolved incidents, ${targetZone.criticalCount} critical/high`,
      `${targetZone.activeRecoveryCount} recovery actions in progress`,
      ...blockers.map(b => `Blocker: ${b}`),
    ],
    assumptions: [
      'No new critical incidents during recovery window',
      'Current recovery chain remains active and unblocked',
      ctx.activeRecoveryCount > 0 ? `${ctx.activeRecoveryCount} active recovery actions continue to progress` : 'Recovery actions are initiated promptly',
    ],
    recommendedNextAction: recommendations[0]?.title ?? 'Monitor and maintain current recovery actions',
    source: 'deterministic_operational_model',
  };
}

function answerCauseExplanation(q: RoutedQuestion, ctx: OperationalContext): CopilotAnswer {
  const { assessment } = ctx;

  const targetZone = q.targetZone
    ? assessment.zoneAssessments.find(z => z.zoneId === q.targetZone)
    : getWorstZone(assessment);

  if (!targetZone || targetZone.pressureSources.length === 0) {
    return {
      title: 'Cause Analysis',
      answer: 'No significant pressure sources identified. Operation is within normal parameters.',
      confidence: 'high',
      bullets: [`Global stability: ${assessment.globalStability}`, `Global pressure: ${assessment.globalPressure}/100`],
      assumptions: [],
      source: 'deterministic_operational_model',
    };
  }

  const topSource = targetZone.pressureSources[0];
  const bullets = targetZone.explanation.map(e => e);

  return {
    title: `Pressure Analysis — ${targetZone.zoneLabel}`,
    answer: `${targetZone.zoneLabel} is ${targetZone.stability} (pressure ${targetZone.pressure}/100). Primary cause: ${topSource.description.toLowerCase()}.`,
    confidence: targetZone.pressure >= 60 ? 'high' : 'moderate',
    bullets,
    assumptions: [],
    recommendedNextAction: ctx.recommendations.find(r => r.affectedZone === targetZone.zoneId)?.title,
    source: 'deterministic_operational_model',
  };
}

function answerRiskAssessment(q: RoutedQuestion, ctx: OperationalContext): CopilotAnswer {
  const { assessment, recommendations } = ctx;

  const worst = getWorstZone(assessment);
  if (!worst || assessment.globalStability === 'stable') {
    return {
      title: 'Risk Assessment',
      answer: 'No elevated risk detected. All zones within normal operational parameters.',
      confidence: 'high',
      bullets: [`Global pressure: ${assessment.globalPressure}/100`],
      assumptions: [],
      source: 'deterministic_operational_model',
    };
  }

  // Find zones that could cascade
  const atRisk = assessment.zoneAssessments
    .filter(z => z.stability !== 'stable')
    .sort((a, b) => b.pressure - a.pressure);

  const bullets: string[] = atRisk.slice(0, 4).map(z =>
    `${z.zoneLabel}: ${z.stability} (${z.pressure}/100, ${z.unresolvedCount} unresolved)`
  );

  if (worst.oldestUnresolvedMinutes > 30) {
    bullets.push(`Aging risk: oldest incident unresolved for ${worst.oldestUnresolvedMinutes} minutes`);
  }

  const stalledRAs = worst.pressureSources.find(ps => ps.type === 'stalled_recovery');
  if (stalledRAs) {
    bullets.push(`Stalled recovery: ${stalledRAs.description}`);
  }

  return {
    title: 'Risk Assessment',
    answer: `Highest risk: ${worst.zoneLabel} at ${worst.pressure}/100 pressure (${worst.stability}). ${worst.unresolvedCount} unresolved incidents${worst.criticalCount > 0 ? `, ${worst.criticalCount} critical/high` : ''}. Unresolved duration increases cascade probability to adjacent zones.`,
    confidence: 'moderate',
    bullets,
    assumptions: [
      'Risk modeled from current incident distribution and severity',
      'Adjacent zone cascade based on resource sharing patterns',
    ],
    recommendedNextAction: recommendations[0]?.title ?? 'Address highest-pressure zone first',
    source: 'deterministic_operational_model',
  };
}

function answerRecoveryPlan(q: RoutedQuestion, ctx: OperationalContext): CopilotAnswer {
  const { dispatchPlan, recommendations, assessment } = ctx;

  if (recommendations.length === 0) {
    return {
      title: 'Recovery Plan',
      answer: 'No specific recovery actions recommended. Operation is within manageable parameters.',
      confidence: 'high',
      bullets: ['Continue monitoring current state', 'Maintain active recovery actions'],
      assumptions: [],
      source: 'deterministic_operational_model',
    };
  }

  const topRecs = recommendations.slice(0, 3);
  const bullets = topRecs.map((r, i) =>
    `${i + 1}. ${r.title} (${r.severity}, confidence ${r.confidence.score}%, est. ${r.estimatedStabilizationMinutes}m)`
  );

  if (dispatchPlan.totalEstimatedMinutes > 0) {
    bullets.push(`Total estimated stabilization: ${dispatchPlan.totalEstimatedMinutes}m`);
  }

  return {
    title: 'Recommended Recovery Plan',
    answer: `${dispatchPlan.summary} Top priority: ${topRecs[0].title}. ${topRecs[0].recommendedActions[0]?.expectedImpact ?? ''}`,
    confidence: topRecs[0].confidence.label === 'very_high' || topRecs[0].confidence.label === 'high' ? 'high' : 'moderate',
    bullets,
    assumptions: [
      'Recommendations assume current operational state continues',
      'Stabilization estimates assume no new critical incidents',
    ],
    recommendedNextAction: `Approve: ${topRecs[0].title}`,
    source: 'deterministic_operational_model',
  };
}

function answerResourceQuestion(q: RoutedQuestion, ctx: OperationalContext): CopilotAnswer {
  const { assessment, recommendations } = ctx;

  if (q.resourceId) {
    // Specific resource question
    const affectedZones = assessment.zoneAssessments.filter(z =>
      z.pressureSources.some(ps => ps.contributingIds.some(id => id.includes(q.resourceId!)))
    );

    if (affectedZones.length > 0) {
      return {
        title: `Resource Analysis — ${q.resourceId}`,
        answer: `${q.resourceId} is referenced in ${affectedZones.length} zone${affectedZones.length > 1 ? 's' : ''} under pressure. Moving this resource would affect: ${affectedZones.map(z => z.zoneLabel).join(', ')}.`,
        confidence: 'moderate',
        bullets: affectedZones.map(z => `${z.zoneLabel}: pressure ${z.pressure}/100, ${z.unresolvedCount} unresolved`),
        assumptions: ['Impact analysis based on current zone assignments and pressure state'],
        source: 'deterministic_operational_model',
      };
    }

    return {
      title: `Resource Analysis — ${q.resourceId}`,
      answer: `${q.resourceId} is not currently referenced in any active pressure source. Redeployment would have minimal modeled impact on current operations.`,
      confidence: 'low',
      bullets: ['Resource not found in active incident or recovery action data'],
      assumptions: ['Analysis limited to currently visible operational state'],
      source: 'deterministic_operational_model',
    };
  }

  // General resource question
  const equipSources = assessment.zoneAssessments.flatMap(z =>
    z.pressureSources.filter(ps => ps.type === 'equipment_recurrence')
  );

  const bullets: string[] = [];
  if (equipSources.length > 0) {
    bullets.push(...equipSources.map(ps => `Equipment issue: ${ps.description}`));
  }

  const stableZones = assessment.zoneAssessments.filter(z => z.stability === 'stable');
  if (stableZones.length > 0) {
    bullets.push(`${stableZones.length} stable zone${stableZones.length > 1 ? 's' : ''} may have available resources: ${stableZones.map(z => z.zoneLabel).join(', ')}`);
  }

  return {
    title: 'Resource Overview',
    answer: equipSources.length > 0
      ? `${equipSources.length} equipment issue${equipSources.length > 1 ? 's' : ''} identified as pressure sources. ${stableZones.length} zone${stableZones.length > 1 ? 's' : ''} currently stable and may have spare capacity.`
      : `No equipment issues identified. ${stableZones.length > 0 ? `${stableZones.map(z => z.zoneLabel).join(', ')} may have available resources.` : 'All zones under pressure — resource rebalancing recommended.'}`,
    confidence: 'moderate',
    bullets,
    assumptions: ['Resource availability inferred from zone stability, not live roster data'],
    source: 'deterministic_operational_model',
  };
}

function answerSummary(ctx: OperationalContext): CopilotAnswer {
  const { assessment, recommendations, dispatchPlan } = ctx;

  const pressured = assessment.zoneAssessments.filter(z => z.stability !== 'stable');
  const bullets: string[] = [
    `${ctx.activeIncidentCount} active incidents across ${assessment.zoneAssessments.length} zones`,
    `Global pressure: ${assessment.globalPressure}/100 (${assessment.globalStability})`,
  ];

  if (pressured.length > 0) {
    bullets.push(`${pressured.length} zone${pressured.length > 1 ? 's' : ''} under pressure: ${pressured.map(z => `${z.zoneLabel} (${z.pressure})`).join(', ')}`);
  }

  if (recommendations.length > 0) {
    bullets.push(`Top recommendation: ${recommendations[0].title}`);
  }

  if (dispatchPlan.totalEstimatedMinutes > 0) {
    bullets.push(`Estimated total stabilization: ${dispatchPlan.totalEstimatedMinutes}m`);
  }

  if (ctx.activeRecoveryCount > 0) {
    bullets.push(`${ctx.activeRecoveryCount} recovery actions in progress`);
  }

  return {
    title: 'Operational Summary',
    answer: assessment.summary,
    confidence: 'high',
    bullets,
    assumptions: [],
    recommendedNextAction: recommendations[0]?.title,
    source: 'deterministic_operational_model',
  };
}

// ============================================================
// HELPERS
// ============================================================

function getWorstZone(assessment: OperationalAssessment): ZoneAssessment | null {
  if (assessment.zoneAssessments.length === 0) return null;
  return [...assessment.zoneAssessments].sort((a, b) => b.pressure - a.pressure)[0];
}

function estimateFromZone(zone: ZoneAssessment): number {
  const base = zone.criticalCount > 0 ? 30 : zone.unresolvedCount >= 3 ? 22 : 15;
  const agePenalty = Math.min(zone.oldestUnresolvedMinutes / 8, 20);
  const recoveryBonus = zone.activeRecoveryCount * 4;
  return Math.max(8, Math.round(base + agePenalty - recoveryBonus));
}
