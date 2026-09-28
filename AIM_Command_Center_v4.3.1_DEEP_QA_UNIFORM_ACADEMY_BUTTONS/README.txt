AIM™ Command Center v0.3 — Certification Prototype

RUN
1. Extract the ZIP.
2. Double-click index.html.
3. Open with Chrome or Microsoft Edge.

NEW IN v0.3
- Expanded AIM™ Academy qualification experience
- 10 representative interactive command missions across:
  financial, clinical, cybersecurity, manufacturing, HR, infrastructure,
  legal, public service, agentic AI, and enterprise governance
- Mission decision explanations
- Mission accuracy and command-readiness tracking
- 10-question working AIM-CP prototype exam with 80% pass gate
- Qualification gates connecting:
  Academy + Missions + Exam + Practical AIM™ Dx + Last Command
- Credential issuance preview when all prototype gates are satisfied
- Persistent progress using browser localStorage
- AIM™ Command Center remains the master platform brand

IMPORTANT
This remains a local front-end prototype. It does not yet issue a real credential.
Production certification needs secure identity/account management, server-side exam
logic, a larger protected question bank, practical review, database/audit history,
payments, PDF certificate/report generation, credential revocation/renewal, and a
public verification service at AIMCommandCenter.com.


NEW IN v0.4 — AIM™ RISK COLOR SCALE
- Four-band AAI visual scale:
  0–24 Lower autonomy exposure
  25–49 Moderate exposure
  50–74 Elevated exposure
  75–100 Critical control attention
- Color-coded result panel and AAI marker
- Color-coded 1–5 dimension scores
- Enterprise registry uses the same exposure language

Important methodological note:
The color scale represents measured autonomy/authority exposure, not a universal
declaration that an AI system is “safe” or “unsafe.” Final authorization depends
on context, consequence, control effectiveness, evidence, and tested human command.


NEW IN v0.5 — EXECUTIVE VISUAL CONTROL VIEW
- Replaced rectangular exposure legend with traffic-light indicators:
  Green 0–24, Yellow 25–49, Orange 50–74, Red 75–100.
- Removed mustard/brown presentation backgrounds in favor of a cleaner
  blue/white/neutral executive interface.
- Added AIM™ Risk Dial / speedometer on the main dashboard.
- Added live needle driven by the latest AAI score.
- Added 11-dimension heat map driven by the latest AIM™ Dx scores.
- Heat map uses the same traffic-light visual language.
- Maintains the methodological distinction between autonomy exposure and a
  universal safety verdict.


NEW IN v0.6 — ONE-SCREEN EXECUTIVE DASHBOARD
- AIM™ Risk Dial needle now changes to the same traffic-light color as the current risk band.
- Risk-status badge beneath the dial also changes dynamically with the risk band.
- Dashboard redesigned to keep core executive information on one desktop screen:
  compact command strip + KPIs + Risk Dial + 11-Dimension Heat Map.
- Removed oversized dashboard hero and lower promotional cards from the executive view.
- Responsive behavior remains for smaller screens, where scrolling may still be necessary.


v0.9 STABLE
-----------
This version deliberately rolls back to the known-working v0.6 codebase.
Only one change was made: AIM™ Dx is arranged side-by-side on desktop so the
assessment inputs and calculated result chart can be visible together.

No dashboard logic, navigation logic, scoring logic, Academy logic, Rx logic,
or certification logic from v0.6 was replaced.


v1.0 APPROVED AIM™ Dx
---------------------
Applied the approved Image 1 visual direction to the stable v0.9 portal:
- dark navy top navigation
- compact one-screen AIM™ Dx desktop layout
- agent fields directly above the 11 dimensions
- no large white gap
- dark executive analytics panel on the right
- integrated AAI score, dynamic risk status, risk scale, semicircle gauge
- authority concentration bars
- traffic-light colors: green / yellow / orange / red
- left-side 1–5 score pills also follow the traffic-light language
- preserved the stable scoring, navigation, localStorage, Rx, Academy,
  certification, registry, and administration logic from the stable base

Run by extracting the ZIP and opening index.html in Chrome or Edge.


v1.1 — EVIDENCE-BASED AIM™ Dx
------------------------------
Adds an objective calibration layer designed to reduce assessor subjectivity.

New:
- Agent Role Baseline for 11 common agent categories.
- Ten observable capability questions covering execution, financial commitment,
  system privilege, velocity, scale, delegation, consequence, reversibility,
  human intervention, and data authority.
- AIM™ derives all 11 dimension scores from those observable conditions.
- Evidence-Based AAI is calculated separately from the Assessor AAI.
- Variance is displayed live.
- A material variance (10+ AAI points) triggers a visible justification field.
- "Apply AIM™ Evidence Scores to Assessment" copies the derived dimension values
  into the formal AIM™ Dx assessment.
- Role baseline is shown as a challenge/reference baseline; it does not silently
  force the final score.

Methodological intent:
Role alone does not define risk. Actual delegated authority, scale, consequence,
and human-control conditions drive the evidence-based score. AAI remains an
autonomy/authority exposure measure, not a universal safety verdict.


v1.2 — READABILITY + WORKFLOW
-----------------------------
- Significantly increased text size throughout AIM™ Dx.
- STEP 1 is now the AIM™ Evidence-Based Assessment and is visually separated
  with a blue/teal background, strong blue outline, and "Complete this section first."
- STEP 2 is clearly labeled above the 11 AIM™ dimensions.
- Evidence labels, dropdowns, summary scores, AAI result, risk status, and
  authority-concentration text are all larger.
- Boxes were tightened where necessary so readability improves without returning
  to excessive scrolling on normal desktop displays.

v1.3 — STEP 1 / STEP 2 NON-OVERLAPPING LAYOUT
----------------------------------------------
- Rebuilt the AIM Dx left column using normal document flow instead of stacked
  fixed grid offsets, eliminating the Step 1 / Step 2 overlap.
- Step 1 is a blue Objective Calibration / Evidence-Based Assessment card.
- Step 2 is a separate green Review / Complete 11 AIM Dimensions card.
- Moved "Apply AIM Evidence Scores" into the Step 2 header.
- Right analytics panel remains visible with sticky positioning.
- Preserved the v1.1 evidence scoring, variance logic, and stable portal functions.

v1.4 — APPROVED PRODUCTION LAYOUT
---------------------------------
- Applied the approved non-overlapping Step 1 / Step 2 interface to the portal.
- Step 1 includes Calculate Evidence-Based Scores and Reset Step 1.
- Step 2 remains a separate green review area with Apply AIM Evidence Scores.
- Score Comparison is displayed beneath the right-side analytics panel.
- Preserves evidence-based scoring, AAI calculation, variance detection,
  justification controls, Academy, Rx, Registry, Certification and Administration.

v1.5 — BULLETPROOF EVIDENCE-TO-AAI WORKFLOW
--------------------------------------------
1. Step 1 objective evidence now automatically seeds Step 2.
2. Each Step 2 dimension displays an AIM Evidence Floor.
3. Values below the evidence-derived floor are disabled. Users may raise a
   dimension when additional authority/consequence is known, but cannot lower it.
4. Final AAI calculation is now in the Step 2 header and is visible without
   scrolling on desktop.
5. How to Use is now a real functional modal explaining the six-step workflow.
6. The methodology explicitly separates:
      Inherent Authority (AIM Dx)
      Governance Controls (AIM Rx)
      Residual Exposure (after controls)
   Controls do not rewrite the underlying authority measurement.
7. Evidence-Based AAI and Final AAI remain separate for auditability.
