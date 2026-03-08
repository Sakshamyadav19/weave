# Weave — PostHog Engineering Impact Dashboard

> **Approach (≤300 chars):** Measures _consequences_ of behavior, not activity counts. Three signals: Dark Matter (review comments that triggered code rewrites), Gravitational Pull (manual review requests as a trust proxy), and Rework Efficiency (PR revision cycles). All from public GitHub data.

---

## What it does

Weave answers one question for an engineering leader: **"Who are the most impactful engineers at PostHog right now, and why?"**

It deliberately avoids commit counts, PR counts, and lines of code — metrics that measure presence, not impact. Instead it measures:

| Dimension | What it captures |
|---|---|
| **Dark Matter** | Review comments that caused a 50+ line code change within 48h — impact invisible in your own commit history |
| **Gravitational Pull** | How often teammates manually request your review, filtered for CODEOWNERS auto-assignments — social trust as a signal |
| **Rework Efficiency** | How many changes-requested → re-review cycles your PRs need before merging — a friction cost on the whole team |
| **Incomplete Fix Rate** | Issues you closed that were reopened within 14 days — did the fix hold? *(profile card only)* |
| **Dependency Footprint** | How many non-trivial PRs explicitly depend on your work vs. you depending on others *(profile card only)* |

---

## Views

### Main Dashboard
Four panels, no scroll, fits one viewport:
- **Impact Leaderboard** — top engineers ranked by composite score (Dark Matter 40% + Gravitational Pull 35% + Rework 25%), animated segmented bars
- **Trust Network** — co-review matrix (12×12 heatmap) showing who reviews whose PRs and how often
- **Review Reciprocity** — diverging butterfly bar chart: reviews given (left) vs. received (right) per engineer
- **Red Flags** — knowledge silo risk and high rework loop signals, framed as conversation starters not verdicts

### Profile Card
Slides in from the right on any engineer click. Shows work type breakdown, incomplete fix rate, dependency footprint, and cohort percentile — data the main dashboard cannot show at scale.

---

## Architecture

- **React + Vite** — no backend, all GitHub API calls made client-side
- **3-layer progressive fetch**: Layer 1 (~3s) renders leaderboard and network from PR + review events; Layer 2 (~8s) computes Dark Matter from review comments + commit diffs; Layer 3 (on-demand) fetches issue events and PR bodies for profile cards
- **Raw SVG** for Trust Network and Review Reciprocity — ResizeObserver-driven, fully responsive
- **Tailwind CSS** + neo-brutalist design system (cream background, thick black borders, offset shadows)
- **No localStorage** — token and data held in React state only, never persisted

---

## Setup

```bash
# 1. Clone and install
npm install

# 2. Create a .env file
cp .env.example .env
# Add your GitHub token: VITE_GITHUB_TOKEN=ghp_...

# 3. Run
npm run dev
```

You need a GitHub Personal Access Token with `repo` (read) scope. Without it the app hits GitHub's 60 req/hr unauthenticated limit and will not load.

---

## What was explicitly excluded — and why

| Signal | Why rejected |
|---|---|
| Commit count | Measures how often you save, not what you shipped |
| Lines of code | Verbose code scores higher than elegant code |
| PR count | A critical fix and a README update are the same count |
| Merge frequency | Presence metric, not quality metric |
| After-hours timestamps | Teams have flexible hours by design — not a burnout signal |
| Comment count per PR | A well-written PR needs fewer comments, not more |

---

## Evaluation notes

**Thoughtfulness** — Every metric connects to an outcome (code changed, trust expressed, rework avoided), not to an action. Each has a documented honest limitation. The tool surfaces conversation starters, not verdicts.

**Technical execution** — Three-layer progressive fetch with skeleton loading; raw SVG charts that scale with ResizeObserver; bot account filtering; CODEOWNERS-aware Gravitational Pull scoring.

**Pragmatism** — Scoped to what the GitHub public API can reliably provide. Deliberately dropped signals (file centrality, blame survival, Shannon entropy) that sound sophisticated but produce noisy or misleading results at this repo's pace of change.
