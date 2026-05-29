/**
 * SOI Intelligence Core — Operational Answer Generator
 *
 * Generates natural, conversational operational answers from live state.
 * SOI speaks like a calm, confident operations partner — not a chatbot.
 * All reasoning is deterministic. No LLM.
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
      // Intent-first: give the best operational answer we can
      return answerFromContext(ctx);
  }
}

// ============================================================
// INTENT-FIRST DEFAULT
// ============================================================

function answerFromContext(ctx: OperationalContext): CopilotAnswer {
  const { assessment, recommendations } = ctx;
  const worst = getWorstZone(assessment);

  if (worst && worst.pressure >= 40) {
    // There's something going on — lead with it
    return {
      title: 'Here\'s the situation',
      answer: `${worst.zoneLabel} is your main concern right now — pressure at ${worst.pressure} with ${worst.unresolvedCount} unresolved incident${worst.unresolvedCount !== 1 ? 's' : ''}. ${recommendations.length > 0 ? `I'd recommend: ${recommendations[0].title}.` : 'I\'m monitoring for the best move.'}`,
      confidence: 'high',
      bullets: assessment.zoneAssessments
        .filter(z => z.pressure >= 30)
        .map(z => `${z.zoneLabel}: ${z.stability}, pressure ${z.pressure}`),
      assumptions: [],
      recommendedNextAction: recommendations[0]?.title,
      source: 'deterministic_operational_model',
    };
  }

  // Everything calm
  return {
    title: 'Operations Nominal',
    answer: `All clear. Pressure at ${assessment.globalPressure}, ${ctx.activeIncidentCount} incident${ctx.activeIncidentCount !== 1 ? 's' : ''} under management. Nothing needs immediate attention.`,
    confidence: 'high',
    bullets: [],
    assumptions: [],
    source: 'deterministic_operational_model',
  };
}

// ============================================================
// INTENT HANDLERS — NATURAL OPERATIONAL LANGUAGE
// ============================================================

function answerStabilityTiming(q: RoutedQuestion, ctx: OperationalContext): CopilotAnswer {
  const { assessment, recommendations, dispatchPlan } = ctx;

  const targetZone = q.targetZone
    ? assessment.zoneAssessments.find(z => z.zoneId === q.targetZone)
    : getWorstZone(assessment);

  if (!targetZone || assessment.globalStability === 'stable') {
    return {
      title: 'Stability Check',
      answer: `We're stable. Pressure at ${assessment.globalPressure}, ${ctx.activeIncidentCount} incident${ctx.activeIncidentCount !== 1 ? 's' : ''} being managed. No stabilization action needed right now.`,
      confidence: 'high',
      bullets: [],
      assumptions: [],
      source: 'deterministic_operational_model',
    };
  }

  const estMin = dispatchPlan.totalEstimatedMinutes > 0
    ? dispatchPlan.totalEstimatedMinutes
    : estimateFromZone(targetZone);
  const rangeMin = Math.round(estMin * 0.75);
  const rangeMax = Math.round(estMin * 1.35);

  return {
    title: 'Stabilization Window',
    answer: `Looking at ${rangeMin} to ${rangeMax} minutes to full stability. ${targetZone.zoneLabel} is the bottleneck — ${targetZone.unresolvedCount} unresolved incident${targetZone.unresolvedCount !== 1 ? 's' : ''} at pressure ${targetZone.pressure}. ${targetZone.activeRecoveryCount > 0 ? `${targetZone.activeRecoveryCount} recovery action${targetZone.activeRecoveryCount !== 1 ? 's' : ''} in progress.` : 'No recovery actions running yet.'}`,
    confidence: targetZone.pressure >= 80 ? 'moderate' : 'high',
    bullets: [
      `${targetZone.zoneLabel}: ${targetZone.stability}, pressure ${targetZone.pressure}`,
      ...targetZone.pressureSources.slice(0, 2).map(b => b.description),
    ],
    assumptions: ['Assumes no new critical incidents', 'Current recovery continues unblocked'],
    recommendedNextAction: recommendations[0]?.title,
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
      title: 'Nothing Flagged',
      answer: `No pressure sources showing. Pressure at ${assessment.globalPressure} — within normal range.`,
      confidence: 'high',
      bullets: [],
      assumptions: [],
      source: 'deterministic_operational_model',
    };
  }

  const topSource = targetZone.pressureSources[0];

  return {
    title: `${targetZone.zoneLabel} — ${targetZone.stability}`,
    answer: `${targetZone.zoneLabel} is ${targetZone.stability} at pressure ${targetZone.pressure}. The main driver is ${topSource.description.toLowerCase()}.${targetZone.pressureSources.length > 1 ? ` Also seeing ${targetZone.pressureSources[1].description.toLowerCase()}.` : ''}`,
    confidence: targetZone.pressure >= 60 ? 'high' : 'moderate',
    bullets: targetZone.explanation,
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
      title: 'Risk Check',
      answer: `No elevated risk right now. All zones stable, pressure at ${assessment.globalPressure}. I'll flag anything that changes.`,
      confidence: 'high',
      bullets: [],
      assumptions: [],
      source: 'deterministic_operational_model',
    };
  }

  const atRisk = assessment.zoneAssessments
    .filter(z => z.stability !== 'stable')
    .sort((a, b) => b.pressure - a.pressure);

  const bullets: string[] = atRisk.slice(0, 4).map(z =>
    `${z.zoneLabel}: ${z.stability}, pressure ${z.pressure}, ${z.unresolvedCount} unresolved`
  );
  if (worst.oldestUnresolvedMinutes > 30) {
    bullets.push(`Oldest unresolved: ${worst.oldestUnresolvedMinutes} minutes — cascade risk increasing`);
  }

  return {
    title: 'Risk Assessment',
    answer: `Your biggest risk is ${worst.zoneLabel} — pressure ${worst.pressure}, ${worst.unresolvedCount} unresolved incident${worst.unresolvedCount !== 1 ? 's' : ''}${worst.criticalCount > 0 ? `, ${worst.criticalCount} critical` : ''}. The longer these sit, the higher the cascade probability to neighboring gates.`,
    confidence: 'moderate',
    bullets,
    assumptions: ['Based on current incident distribution and severity'],
    recommendedNextAction: recommendations[0]?.title ?? 'Address the highest-pressure area first',
    source: 'deterministic_operational_model',
  };
}

function answerRecoveryPlan(q: RoutedQuestion, ctx: OperationalContext): CopilotAnswer {
  const { dispatchPlan, recommendations } = ctx;

  if (recommendations.length === 0) {
    return {
      title: 'Recovery Status',
      answer: `Nothing urgent. Operations are manageable. I'm monitoring and will flag anything that needs action.`,
      confidence: 'high',
      bullets: [],
      assumptions: [],
      source: 'deterministic_operational_model',
    };
  }

  const topRecs = recommendations.slice(0, 3);

  return {
    title: 'Recommended Play',
    answer: `Here's what I'd do. Priority one: ${topRecs[0].title}. ${topRecs[0].recommendedActions[0]?.expectedImpact ?? ''} ${dispatchPlan.totalEstimatedMinutes > 0 ? `Estimated ${dispatchPlan.totalEstimatedMinutes} minutes to stabilization.` : ''}`,
    confidence: topRecs[0].confidence.label === 'very_high' || topRecs[0].confidence.label === 'high' ? 'high' : 'moderate',
    bullets: topRecs.map((r, i) =>
      `${i + 1}. ${r.title} — ${r.severity}, confidence ${r.confidence.score}%`
    ),
    assumptions: ['Assumes current state continues', 'No new critical incidents'],
    recommendedNextAction: topRecs[0].title,
    source: 'deterministic_operational_model',
  };
}

function answerResourceQuestion(q: RoutedQuestion, ctx: OperationalContext): CopilotAnswer {
  const { assessment } = ctx;

  if (q.resourceId) {
    const affectedZones = assessment.zoneAssessments.filter(z =>
      z.pressureSources.some(ps => ps.contributingIds.some(id => id.includes(q.resourceId!)))
    );

    if (affectedZones.length > 0) {
      return {
        title: `${q.resourceId}`,
        answer: `${q.resourceId} is tied to ${affectedZones.length} pressured area${affectedZones.length > 1 ? 's' : ''}: ${affectedZones.map(z => z.zoneLabel).join(', ')}. Moving it would affect those zones.`,
        confidence: 'moderate',
        bullets: affectedZones.map(z => `${z.zoneLabel}: pressure ${z.pressure}, ${z.unresolvedCount} unresolved`),
        assumptions: [],
        source: 'deterministic_operational_model',
      };
    }

    return {
      title: `${q.resourceId}`,
      answer: `${q.resourceId} isn't showing up in any active pressure source. Safe to redeploy if needed.`,
      confidence: 'moderate',
      bullets: [],
      assumptions: [],
      source: 'deterministic_operational_model',
    };
  }

  const stableZones = assessment.zoneAssessments.filter(z => z.stability === 'stable');
  const equipSources = assessment.zoneAssessments.flatMap(z =>
    z.pressureSources.filter(ps => ps.type === 'equipment_recurrence')
  );

  return {
    title: 'Resource Status',
    answer: equipSources.length > 0
      ? `${equipSources.length} equipment issue${equipSources.length > 1 ? 's' : ''} contributing to pressure. ${stableZones.length > 0 ? `${stableZones.map(z => z.zoneLabel).join(', ')} may have spare capacity.` : 'All zones loaded — consider rebalancing.'}`
      : `No equipment issues. ${stableZones.length > 0 ? `${stableZones.map(z => z.zoneLabel).join(', ')} have available capacity.` : 'All zones under pressure.'}`,
    confidence: 'moderate',
    bullets: equipSources.map(ps => ps.description),
    assumptions: [],
    source: 'deterministic_operational_model',
  };
}

function answerSummary(ctx: OperationalContext): CopilotAnswer {
  const { assessment, recommendations, dispatchPlan } = ctx;

  const pressured = assessment.zoneAssessments.filter(z => z.stability !== 'stable');
  const bullets: string[] = [];

  if (pressured.length > 0) {
    bullets.push(...pressured.map(z => `${z.zoneLabel}: ${z.stability}, pressure ${z.pressure}`));
  }
  if (recommendations.length > 0) {
    bullets.push(`Top recommendation: ${recommendations[0].title}`);
  }
  if (ctx.activeRecoveryCount > 0) {
    bullets.push(`${ctx.activeRecoveryCount} recovery action${ctx.activeRecoveryCount !== 1 ? 's' : ''} in progress`);
  }

  const summary = assessment.globalPressure >= 60
    ? `Pressure at ${assessment.globalPressure}. ${pressured.length} area${pressured.length !== 1 ? 's' : ''} need${pressured.length === 1 ? 's' : ''} attention. ${ctx.activeIncidentCount} active incident${ctx.activeIncidentCount !== 1 ? 's' : ''}. ${recommendations.length > 0 ? `I'd prioritize ${recommendations[0].title}.` : ''}`
    : `Operations at pressure ${assessment.globalPressure}. ${ctx.activeIncidentCount} incident${ctx.activeIncidentCount !== 1 ? 's' : ''} being managed. ${ctx.activeRecoveryCount > 0 ? `${ctx.activeRecoveryCount} recovery action${ctx.activeRecoveryCount !== 1 ? 's' : ''} running.` : 'No active recovery chains.'} Nothing critical right now.`;

  return {
    title: 'Operational Summary',
    answer: summary,
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
