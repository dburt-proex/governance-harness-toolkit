# GHT-RAG-006 — Outcome metrics and commercial validation receipt
Date: 2026-11-19
Branch: research/governed-rag-preflight-20261105
Scope: offline customer-service harness evaluation; no external execution.

## Evidence
- Zendesk CX Trends 2027, published 2026-11-17: 85% of surveyed leaders favor verified-outcome pricing; vendor-reported survey, not DAXXER willingness to pay. https://www.zendesk.fr/newsroom/articles/ai-is-reshaping-service-74-of-business-leaders-surveyed-expect-ai-agents-to-outnumber-people-interactions-within-two-years/
- NiCE survey, published 2026-10-29: 118 practitioners across 70+ customer organizations, oversight and auditability cited as adoption enablers; vendor-customer sample. https://www.nice.com/announcements/nice-customer-survey-personal-ai-agents-are-reaching-customer-service-front-lines-and-businesses-are-building-ai-agent-teams-to-meet-them
- Gartner, published 2026-08-04: 87% of surveyed customers consider human access essential with GenAI service. https://www.gartner.com/en/newsroom/press-releases/2026-08-04-gartner-survey-finds-87-percent-of-customers-say-companies-using-genai-for-customer-service-must-provide-access-to-a-human-agent0
- ASAPP Consumer Agent Index, November 2026: approximately 2,300 agent-originated chats across four customers, AI classification by LLM; narrow vendor sample. https://www.asapp.com/ebooks/asapp-consumer-agent-index-volume-1

## Decision
Maintain governed customer-service intake as initial demonstration; agent runtime controls remain reusable, audit/evaluation is next adjacent market, generic orchestration deferred. No verified paid DAXXER buyer or actual pilot ROI.

## Implemented
- research/governed-rag-outcome-metrics.js: deterministic, offline aggregate metric evaluator for grounded-answer rate, human-handoff recall, unauthorized actions, p95 latency and mean cost.
- research/governed-rag-outcome-metrics.test.js: 12 synthetic positive/negative fixtures.
- run-regression.js: register new test in canonical test runner.

## Observed validation
Local standalone Node test: 12/12 passed; node --check on evaluator succeeded. Synthetic cases only, no real model, customer, live retrieval or integrations. Full npm test, npm run test:ci, and branch CI were NOT run or verified in this increment.

## Acceptance targets (provisional research thresholds, not contractual SLAs)
Grounded rate >=95%; handoff recall 100% on handoff-required fixtures; unauthorized actions 0; p95 latency <=2500 ms; mean per-case cost <=USD 0.02. Empty handoff cohorts fail to REVIEW, rather than claim recall. Metrics accept externally supplied labels and cost data and do not verify their provenance.

## Risks and next step
Metric labels are self-reported, small sample p95 is unstable, and the output PASS is an offline evaluation verdict, never execution ALLOW. Next: connect authenticated fixture receipts and provenance-backed outcome labels, then obtain full CI on the exact review-branch SHA. Do not merge or deploy without owner approval.
