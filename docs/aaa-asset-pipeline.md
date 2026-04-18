# Fractured Arcanum — AI-Generated Asset Pipeline Guide

> Production plan for creating high-quality, commercially safe game assets through a full AI-first workflow.
>
> **Scope:** prompt systems, model orchestration, generation stages, review gates, file outputs, consistency controls, and production rollout. This is a process guide only.

---

## 1. Goals & Operating Model

### Goals
- Produce **premium, production-ready** visuals for the game using an **AI-first content pipeline**.
- Keep the output stylistically consistent across cards, UI chrome, backgrounds, overlays, icons, and marketing art.
- Preserve **commercial safety** and clean rights management for every model, dataset, font, and reference input.
- Make the workflow **repeatable and scalable**, so one approved look can generate whole asset families instead of one-off pieces.
- Maintain **runtime performance** and keep the current semantic asset registry intact.
- Reduce asset turnaround from days to hours while keeping human review at the approval gates.

### Core Principle
This pipeline is **full AI generated in production flow**, but **human-directed** in art direction, model selection, approval, and final QA. AI does the heavy asset creation; humans act as creative directors and quality control.

### Non-Goals
- Raw one-click generation with no review.
- Random prompt experimentation inside production branches.
- Mimicking copyrighted artists, existing game franchises, or identifiable third-party IP.
- Shipping assets that are visually inconsistent, poorly readable on mobile, or legally unclear.

---

## 2. AI Art Direction System

Before generating any assets, the team must lock an **AI Art Direction Pack**. This is the foundation of the whole workflow.

### Required Inputs
1. **Style pillars**
   - luminous arcane fantasy
   - cracked rune surfaces
   - crystalline magic energy
   - premium mobile readability
   - heroic silhouettes and clean icon language

2. **Visual rules**
   - readable at small sizes
   - strong silhouette separation
   - controlled values and contrast
   - top-left key light with magical rim light
   - no photoreal faces, no muddy backgrounds, no cluttered compositions

3. **Prompt bible**
   A locked collection of:
   - positive prompt blocks
   - negative prompt blocks
   - approved materials and adjectives
   - banned phrasing
   - approved camera, lighting, and composition terms

4. **Reference pack**
   - only original internal sketches, licensed references, or abstract moodboards
   - no copyrighted screenshots used as direct imitation targets

Deliverable:
- one approved internal style pack containing prompt templates, color palette, composition rules, and sample outputs.

---

## 3. Asset Families & Generation Modes

Every asset class should use a specific AI workflow rather than one generic prompt.

| Asset Family | Quality Tier | Generation Mode | Final Output |
|-------------|--------------|-----------------|--------------|
| Legendary card art | S | multi-pass image generation + upscale + cleanup | WebP + PNG fallback |
| Common and rare card art | A | batch generation with locked seeds and prompt families | WebP |
| Backgrounds | A | composition-first generation with depth and negative-space control | WebP |
| UI icons and symbols | B | vector-friendly icon generation and redraw pass | SVG + PNG fallback |
| Panel frames and buttons | B | AI concept to vector rebuild pipeline | SVG |
| Reward and cinematic overlays | S/A | still generation + motion design pass | Lottie or WebM |
| Ambient particles and textures | C | procedural and AI texture generation | WebP / PNG |
| Promo key art | S | bespoke multi-stage generation with strongest review | WebP / print-ready PNG |

### Rule
Do **not** use the same prompt recipe for every surface. Each family gets its own tuned pipeline, seed strategy, and review checklist.

---

## 4. Recommended AI Tool Stack

Standardize tools and versions so outputs remain reproducible.

### Image Generation
Use one approved production stack only:
- commercially safe hosted model service or self-hosted image generation stack
- one primary model for illustrations
- one secondary model for iconography and graphic motifs
- one approved upscaler
- one approved inpainting/outpainting tool

### Suggested Categories
- **Primary image model** for characters, spells, environments, creatures
- **Refiner model** for detail pass and material cleanup
- **Inpainting model** for fixing hands, edge artifacts, UI-negative-space collisions, and text areas
- **Upscaler** for controlled 2× and 4× enhancement
- **Vectorization or redraw tool** for chrome, icons, and UI surfaces
- **Motion tool** for subtle particles, reward reveals, and ambient loops

### Governance Rules
- Model version must be recorded for every shipped asset.
- Every asset batch records prompt, negative prompt, seed, CFG or strength values, upscaler used, and final approval date.
- Only approved model checkpoints or services may be used for production.
- If a model changes, it triggers a new visual consistency review before further batches are made.

---

## 5. Full AI Workflow Stages

The production path is:

**Brief → Prompt Build → Batch Generate → Select → Repair → Upscale → Package → Register → QA → Ship**

### 5.1 Brief Creation
For each asset request, define:
- asset id
- game surface
- tier
- gameplay purpose
- mood and palette
- readability requirements
- output format and target size
- deadline

No generation begins without a brief. This prevents random outputs from entering the pipeline.

### 5.2 Prompt Build
Each asset uses a **structured prompt packet** with:
- subject block
- environment block
- material block
- lighting block
- composition block
- render style block
- negative prompt block
- forbidden artifact block

Example categories for the negative block:
- text
- watermark
- extra limbs
- asymmetrical eyes
- muddy contrast
- overly dark corners
- low-detail hands
- cropped subject
- unreadable silhouette

### 5.3 Batch Generation
Generate in controlled batches, not one image at a time.

Recommended batch size:
- S tier: 16–32 candidate images
- A tier: 24–64 candidate images
- B tier: 40–100 candidate images

For each batch:
- keep the style block fixed
- vary only composition, subject pose, and camera angle
- keep seeds logged
- tag each result with a batch id

### 5.4 Candidate Scoring
Every batch is reviewed against a standard rubric:

| Metric | Weight |
|--------|--------|
| Silhouette clarity | 25% |
| Mobile readability | 20% |
| Style consistency | 20% |
| Material fidelity | 15% |
| Composition quality | 10% |
| Uniqueness / memorability | 10% |

Only top candidates move forward. Do not attempt to salvage weak images when better candidates already exist.

### 5.5 Repair & Inpainting
Selected outputs enter a cleanup stage:
- fix anatomy or appendages
- repair edge noise and object tangents
- open negative space for UI labels and stats
- simplify overly busy backgrounds
- restore focal lighting
- remove accidental glyphs or pseudo-text

This is still part of the AI workflow: targeted inpainting, outpainting, and region-based repair are the standard production method.

### 5.6 Upscale & Detail Lock
Once the image is approved compositionally:
- upscale to shipping master size
- run a detail-preserving pass
- re-check edges and texture over-sharpening
- verify no halos, ringing, or AI texture crawl is introduced

For hero assets, keep a master at 2× or 4× the shipping resolution.

### 5.7 Surface Packaging
After upscale, package for the runtime surface:
- crop to correct aspect ratio
- export to WebP primary
- create PNG fallback where needed
- vector rebuild any UI chrome instead of shipping fuzzy raster chrome
- create static fallback for any animated output

### 5.8 Registration
Once packaged:
- add or update the entry in the manifest
- connect the asset to the existing semantic registry roles
- ensure fallbacks remain valid for missing or delayed assets

### 5.9 QA and Approval
Final approval is blocked until the asset passes the visual, legal, and performance gates described below.

---

## 6. Prompt Engineering Standards

Prompting is now part of production and must be treated like source material.

### Prompt Template Structure
Every prompt should contain these blocks in order:
1. asset role
2. subject description
3. fantasy material language
4. lighting and mood
5. camera or framing
6. detail density
7. readability requirement
8. production quality target
9. negative prompt block

### Prompt Rules
- Use reusable prompt modules, not ad hoc prose.
- Keep a locked “house style” phrase block for all Fractured Arcanum outputs.
- Avoid model-confusing contradictions.
- Avoid naming living artists or copyrighted franchises.
- Use prompt weights only when the team has evidence they improve consistency.

### Seed Rules
- Important asset families use seed ranges reserved by surface.
- Related card cycles should share controlled seed neighborhoods for family resemblance.
- Legendary art should use fresh seeds and more exploration.

---

## 7. Consistency Management

AI can generate fast, but it drifts fast too. This section is what keeps the game looking like one product.

### Consistency Controls
- one locked house style prompt
- one approved color script per release season
- one approved icon geometry language
- one approved lighting model
- one approved texture library for stone, crystal, smoke, ink, and metal

### Batch Locking
For each asset wave, freeze:
- model version
- sampler settings
- resolution
- style block
- negative block
- upscale method

If any of those change mid-wave, label it as a new batch and re-review it.

### Character and Faction Sheets
For recurring heroes, factions, or enemy tribes, maintain AI reference sheets that define:
- silhouette
- armor language
- color accents
- spell motifs
- weapon forms
- taboo shapes or materials

This keeps generated art from drifting across expansions.

---

## 8. File Outputs, Naming, and Storage

The runtime contract should remain clean and predictable.

### Output Formats
| Surface | Shipping Format | Backup / Fallback |
|---------|-----------------|-------------------|
| Card illustration | WebP | PNG |
| Background | WebP | PNG |
| Icon / emblem | SVG | PNG |
| Button / panel chrome | SVG | none or PNG preview |
| Overlay animation | Lottie or WebM | static PNG |
| Particle texture | WebP / PNG | none |

### Naming Rules
- use kebab-case only
- no spaces
- no vague names like final-final-2
- final shipped file names must be stable and semantic

### Metadata to Save Per Asset
- asset id
- prompt version
- negative prompt version
- model used
- seed
- batch id
- upscale method
- operator
- approval date
- shipping checksum

### Source Storage Layout
The team should keep:
- prompt packets
- raw generations
- shortlisted candidates
- repaired outputs
- shipping masters
- optimized runtime exports

All of that should be versioned and retained for traceability.

---

## 9. Quality Gates for AI Outputs

AI-generated does not mean auto-approved.

### Visual Rejection Criteria
Reject any asset with:
- unreadable silhouette
- face or anatomy distortion
- noisy micro-detail at small sizes
- fake text or broken symbols
- tangent collisions with UI elements
- value range too flat or too muddy
- obvious style mismatch with existing approved assets
- repetitive cloned texture patterns

### Production Acceptance Criteria
Approve only if the asset:
- reads clearly at target runtime size
- matches the Fractured Arcanum visual language
- survives crop and compression
- looks premium on both mobile and desktop
- is free of noticeable AI artifacts
- has complete metadata and approval history

### Accessibility Gates
- key icons must remain recognizable in grayscale
- rarity and rank must be shape-coded, not just color-coded
- animation must have a static fallback for reduced-motion users

---

## 10. Legal & Commercial Safety Rules

Because this is a full AI-generated workflow, compliance is mandatory.

### Required Rules
- Only use models and services with terms that allow commercial game asset generation.
- Keep a log of all model sources and license terms.
- Do not prompt for copyrighted characters, trademarked factions, or named artists.
- Do not train on scraped or unlicensed internal datasets.
- Do not ship outputs with uncertain provenance.
- If the rights are unclear, the asset is blocked from release.

### Internal Policy
Every shipped AI asset must be classified as one of:
- internal-original AI output under approved model policy
- AI output plus human-directed repair under approved model policy
- AI concept only, not shippable

Only the first two categories may enter the game.

---

## 11. Runtime Integration Strategy

The game should consume upgraded art without rewriting screens.

### Integration Rules
- keep the semantic asset registry as the source of truth
- point UI roles to the approved generated assets
- keep fallback assets available during rollout
- do not hardcode direct file paths in screens or components
- keep card art mapping stable by card id

### Performance Rules
- lazy-load large art surfaces
- prefer vector for chrome and UI symbols
- ship compressed raster formats for illustrations
- reserve animation for high-impact moments only
- keep initial route payload tightly capped for mobile

If an asset upgrade requires multiple UI files to be hand-edited, the issue is with the registry architecture, not the art workflow.

---

## 12. Team Roles in an AI-First Pipeline

| Role | Responsibility |
|------|----------------|
| Art Director | sets style, approves batches, rejects drift |
| Prompt Designer | builds and tunes prompt modules and negative blocks |
| AI Asset Operator | runs generation batches, logs seeds, prepares candidates |
| Cleanup Specialist | handles inpainting, upscale, crop, packaging |
| Tech Artist | manages manifest, optimization, and runtime-ready exports |
| QA Reviewer | checks readability, consistency, accessibility, and performance |

A small team can combine roles, but the steps should still remain distinct.

---

## 13. Rollout Plan

### Phase 0 — System Lock
- approve the house style pack
- approve the production model stack
- define prompt modules and negative modules
- create metadata logging templates
- create acceptance rubrics and rejection rules

### Phase 1 — UI and Icon Families
- generate and finalize the entire UI chrome family
- standardize buttons, panels, dividers, gems, rank icons, and effect symbols
- verify crispness at small mobile sizes

### Phase 2 — Card Art Generation
- batch-generate the live card set by theme family
- repair and upscale selected winners
- ship in waves while preserving fallbacks

### Phase 3 — Background and Key Art
- generate premium menu, play, battle, and reward backdrops
- create seasonal and promotional hero art
- add overlay-ready cinematic stills

### Phase 4 — Motion and LiveOps
- build animated overlays from approved stills
- introduce event visuals, seasonal banners, and limited-time reward reveals
- establish a repeatable monthly content cadence

---

## 14. Definition of Done

An AI-generated asset is done only when all of the following are true:

- [ ] it was created through the approved AI workflow
- [ ] prompt, seed, model, and batch metadata are recorded
- [ ] obvious AI artifacts have been removed
- [ ] it matches the approved house style
- [ ] it is readable at target runtime size
- [ ] it passes performance and compression targets
- [ ] it is registered in the semantic asset system
- [ ] it has a legal and commercial-safety signoff
- [ ] it has a reduced-motion fallback if animated
- [ ] it is approved for ship by the art or product owner

---

## 15. Immediate Next Actions

To start this workflow now, the team should do these in order:

1. lock the house style prompt pack
2. choose the approved commercial-safe generation stack
3. define batch metadata logging and naming rules
4. pilot one asset family first: rank icons, buttons, or a ten-card art set
5. score the outputs with the rubric
6. refine the prompt system before scaling to the entire game

Once those six steps are complete, this document can function as the production spec for AI-generated asset creation on the project.
