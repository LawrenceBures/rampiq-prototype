# SOI — Design Partner Validation Guide

## For internal use during operational validation conversations

---

## What We're Validating

We are NOT selling. We are validating whether the operational cognition
model is believable, useful, and trustworthy to real operational
personnel.

**The key question:**
> "Does this feel like operations understanding itself?"

---

## Demo Structure (30–45 minutes)

### 1. Context (3 min)
"We're building operational coordination infrastructure for ramp
operations. We'd like your reaction to what the system understands
about operations — not whether you'd buy it."

Do NOT say: AI, machine learning, predictive analytics, automation.
Do say: operational memory, coordination support, replay investigation.

### 2. Live Dashboard (8 min)
Show the frontline coordination console.

Walk through:
- Zone pressure (left rail) — "Which zone needs attention?"
- KPIs + trend sparkline — "How is pressure moving?"
- Attention strip — "What requires action now?"
- Incident triage (right rail) — "What's most urgent?"
- Tab through feed, incidents, patterns

**Ask:** "Does this show the right information? What's missing?
What would you look at first?"

### 3. Incident Detail + Recovery (5 min)
Click an incident. Show:
- Recovery actions with lifecycle transitions
- Event timeline with ownership/escalation markers
- "Operational memory suggests" recommendation (if present)

**Ask:** "Is this how recovery coordination actually works?
What feels wrong about the flow?"

### 4. Replay (8 min)
Click Replay. Step through the operational timeline.

Show:
- Incidents emerging over time
- Zone pressure evolving
- Pattern insights appearing
- Stability direction changing
- Escalation events in timeline (red markers)
- Ownership transfers (blue markers)

**Ask:** "If you could rewind your shift, would this help?
What would you want to see that isn't here?"

### 5. Enterprise Workspace (5 min)
Switch to /enterprise. Show:
- Operational Health tab
- Operational Summary narratives
- Stability section (if destabilizing)
- Workforce tab (with governance notice)

**Ask:** "Would your ops manager find this useful?
Does the separation between coordination and management make sense?"

### 6. Governance Doctrine (3 min)
Show AUTHORITY_NOT_SURVEILLANCE_PUBLIC.md (or explain verbally).

"The system is architecturally designed so that coordinators see
their own workload first. Managers see zone aggregates, not individual
rankings. Individual accountability replay is restricted and audited."

**Ask:** "Would your team trust this system? What would make them
NOT trust it?"

### 7. Open Discussion (10 min)

**Validation questions:**

| Question | What we're learning |
|---|---|
| "What would you call this system?" | Category language |
| "What does it remind you of?" | Market positioning |
| "What problem does this actually solve for you?" | Value proposition |
| "What's the biggest thing it gets wrong?" | Blind spots |
| "Would your team use this during a live shift?" | Adoption friction |
| "What would make you nervous about this system?" | Trust barriers |
| "How would you want to start using this?" | Pilot shape |

---

## What to Listen For

### Trust signals (positive)
- "That's actually how it works"
- "I'd want to see this after a bad shift"
- "My ops manager would love the replay"
- "The separation makes sense"

### Trust signals (negative)
- "My team would think this watches them"
- "This feels like a management tool"
- "The language sounds artificial"
- "Nobody talks like that on the ramp"

### Vocabulary to capture
- How they describe incidents (do they say "incident"?)
- How they describe recovery (do they say "recovery action"?)
- How they describe escalation (do they say "escalate"?)
- How they describe handoffs between shifts
- How they describe operational pressure

---

## What NOT to Do

- Do not promise features based on feedback
- Do not defend the system when they criticize it
- Do not explain the architecture unless they ask
- Do not mention AI, ML, or prediction
- Do not show the stress simulation
- Do not position as replacing any existing system
- Do not compare to competitors by name

---

## After the Conversation

Document:
1. What they said was believable
2. What they said was wrong
3. What language they used that we should adopt
4. What trust concerns they raised
5. What pilot shape they suggested
6. What they said the system actually solves
7. What they called it

---

## Ideal Design Partner Profiles

| Role | Why | What they validate |
|---|---|---|
| Ramp crew chief | Uses coordination tools daily | Frontline trust, vocabulary, workflow realism |
| Station ops manager | Oversees operational health | Enterprise visibility, escalation realism, workforce governance |
| Regional ops director | Multi-station oversight | Institutional memory, replay value, strategic positioning |
| Ground handler ops lead | Third-party coordination | Cross-organization trust, governance sensitivity |

---

## Current System URLs

- **Dashboard**: https://rampiq-prototype.vercel.app/prototype/rampiq/dashboard
- **Enterprise**: https://rampiq-prototype.vercel.app/prototype/rampiq/enterprise
- **Mobile gate**: https://rampiq-prototype.vercel.app/prototype/rampiq/mobile/gate/52A?target=LAX-GATE-52A
- **Governance**: AUTHORITY_NOT_SURVEILLANCE_PUBLIC.md in repo root

---

## Pilot Shape Hypothesis

**Observation-mode pilot:**
- Radio remains primary coordination channel
- SOI observes + reconstructs operational events
- Replay validates cognition against what actually happened
- Recommendations remain advisory (accept/dismiss, never enforced)
- Enterprise visibility demonstrates value to management
- Operational memory accumulates safely over shifts

**Duration:** 2–4 weeks at one station, one shift window
**Success metric:** Operators say "this understood what happened"
