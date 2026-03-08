import { WEIGHTS, MIN_PRS, LEADERBOARD_CAP } from '../constants.js'
import { percentileRank } from './dimensions.js'

// Normalize a map of scores to 0-100 relative to the max
function normalizeScores(scoreMap, getValue) {
  const values = Object.values(scoreMap).map(getValue).filter(v => isFinite(v) && v >= 0)
  const max = Math.max(...values, 0.001)
  const normalized = {}
  for (const [login, data] of Object.entries(scoreMap)) {
    normalized[login] = (getValue(data) / max) * 100
  }
  return normalized
}

export function buildLeaderboard({
  darkMatterScores,
  gravitationalScores,
  reworkProfiles,
  prCounts,
  hasLayer2,
}) {
  // Collect all engineers with enough PRs
  const allLogins = new Set([
    ...Object.keys(gravitationalScores),
    ...Object.keys(reworkProfiles),
  ])

  // Normalize gravitational (count-based)
  const gravValues = Object.values(gravitationalScores)
  const maxGrav = Math.max(...gravValues, 0.001)

  // Compute rework percentiles (inverted: lower rework = higher score)
  const reworkMedians = {}
  for (const [login, profile] of Object.entries(reworkProfiles)) {
    reworkMedians[login] = profile.median
  }
  const allMedians = Object.values(reworkMedians)

  // Dark matter normalization
  const darkMatterValues = {}
  for (const [login, data] of Object.entries(darkMatterScores)) {
    darkMatterValues[login] = data.score || 0
  }
  const maxDM = Math.max(...Object.values(darkMatterValues), 0.001)

  const engineers = []

  for (const login of allLogins) {
    const prCount = prCounts[login] || 0
    if (prCount < MIN_PRS) continue

    // Normalized scores (0-100)
    const normGrav = ((gravitationalScores[login] || 0) / maxGrav) * 100

    const reworkMedian = reworkMedians[login] ?? 0
    const reworkPct = allMedians.length > 1
      ? percentileRank(reworkMedian, allMedians)
      : 0.5
    const normRework = (1 - reworkPct) * 100  // inverted

    const dmScore = darkMatterValues[login] || 0
    const normDM = hasLayer2 ? (dmScore / maxDM) * 100 : 0

    const composite = hasLayer2
      ? normDM * WEIGHTS.darkMatter + normGrav * WEIGHTS.gravitational + normRework * WEIGHTS.rework
      : normGrav * (WEIGHTS.gravitational + WEIGHTS.darkMatter * 0.5) + normRework * (WEIGHTS.rework + WEIGHTS.darkMatter * 0.5)

    engineers.push({
      login,
      composite,
      segments: {
        darkMatter: hasLayer2 ? normDM * WEIGHTS.darkMatter : null,
        gravitational: normGrav * WEIGHTS.gravitational,
        rework: normRework * WEIGHTS.rework,
      },
      raw: {
        gravitational: gravitationalScores[login] || 0,
        reworkMedian,
        darkMatter: dmScore,
        prCount,
      },
      normScores: { normDM, normGrav, normRework },
    })
  }

  // Sort: composite desc, tie-break: darkMatter → gravitational → rework_median (lower wins)
  engineers.sort((a, b) => {
    if (Math.abs(b.composite - a.composite) > 0.01) return b.composite - a.composite
    if (Math.abs(b.raw.darkMatter - a.raw.darkMatter) > 0.001) return b.raw.darkMatter - a.raw.darkMatter
    if (b.raw.gravitational !== a.raw.gravitational) return b.raw.gravitational - a.raw.gravitational
    return a.raw.reworkMedian - b.raw.reworkMedian
  })

  return engineers.slice(0, LEADERBOARD_CAP)
}

// Build network edges (author → reviewer pairings)
export function buildNetworkEdges(prs, reviewEventsMap, prCounts, botAccounts) {
  const edgeCounts = {}  // "author:reviewer" → count

  for (const pr of prs) {
    const author = pr.user?.login
    if (!author || botAccounts.has(author)) continue

    const reviews = reviewEventsMap.get(pr.number) || []
    for (const review of reviews) {
      const reviewer = review.user?.login
      if (!reviewer || reviewer === author || botAccounts.has(reviewer)) continue
      const key = `${author}:${reviewer}`
      edgeCounts[key] = (edgeCounts[key] || 0) + 1
    }
  }

  return Object.entries(edgeCounts)
    .map(([key, weight]) => {
      const [source, target] = key.split(':')
      return { source, target, weight }
    })
    .filter(e => e.weight >= 1)
}

// Get all unique active engineers (for network nodes)
export function getActiveEngineers(prs, reviewEventsMap, botAccounts, cap = 20) {
  const activityCounts = {}

  for (const pr of prs) {
    const author = pr.user?.login
    if (author && !botAccounts.has(author)) {
      activityCounts[author] = (activityCounts[author] || 0) + 2  // authoring weight
    }
    const reviews = reviewEventsMap.get(pr.number) || []
    for (const review of reviews) {
      const reviewer = review.user?.login
      if (reviewer && !botAccounts.has(reviewer)) {
        activityCounts[reviewer] = (activityCounts[reviewer] || 0) + 1
      }
    }
  }

  return Object.entries(activityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, cap)
    .map(([login, activity]) => ({ id: login, activity }))
}
