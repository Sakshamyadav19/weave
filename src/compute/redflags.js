import { BOT_ACCOUNTS, RED_FLAG_THRESHOLDS } from '../constants.js'

// Detect knowledge silo risk — one engineer reviewing the majority of PRs in a module
export function detectKnowledgeSiloRisk(prs, reviewEventsMap, botAccounts = BOT_ACCOUNTS) {
  // Group PRs by top-level module (directory)
  const moduleMap = {}  // module → PR[]

  for (const pr of prs) {
    const modules = new Set(
      (pr.files || [])
        .filter(f => f.includes('/'))          // skip root-level files (README.md etc)
        .map(f => f.split('/')[0])
        .filter(m => m && !m.startsWith('.'))  // skip .github/, .husky/ etc
    )
    for (const module of modules) {
      if (!moduleMap[module]) moduleMap[module] = []
      moduleMap[module].push(pr)
    }
  }

  const flags = []

  for (const [module, modulePRs] of Object.entries(moduleMap)) {
    // Only PRs that received at least one non-author non-bot review
    const reviewedPRs = modulePRs.filter(pr => {
      const reviews = reviewEventsMap.get(pr.number) || []
      return reviews.some(r => {
        const l = r.user?.login
        return l && l !== pr.user?.login && !botAccounts.has(l)
      })
    })

    if (reviewedPRs.length < RED_FLAG_THRESHOLDS.knowledgeSiloMinPRs) continue

    // Count unique PRs reviewed per reviewer in this module
    const reviewerCounts = {}
    for (const pr of reviewedPRs) {
      const reviews = reviewEventsMap.get(pr.number) || []
      const uniqueReviewers = new Set(
        reviews.map(r => r.user?.login)
               .filter(l => l && l !== pr.user?.login && !botAccounts.has(l))
      )
      for (const reviewer of uniqueReviewers) {
        reviewerCounts[reviewer] = (reviewerCounts[reviewer] || 0) + 1
      }
    }

    const sorted = Object.entries(reviewerCounts).sort((a, b) => b[1] - a[1])
    if (!sorted.length) continue

    const [topReviewer, topCount] = sorted[0]
    const siloRatio = topCount / reviewedPRs.length

    if (siloRatio >= RED_FLAG_THRESHOLDS.knowledgeSiloThreshold) {
      flags.push({
        type: 'knowledge_silo',
        engineer: topReviewer,
        module,
        value: topCount,
        totalPRs: reviewedPRs.length,
        label: `${topCount}/${reviewedPRs.length} PRs in ${module}/`,
        severity: siloRatio >= 0.95 ? 'high' : 'medium',
      })
    }
  }

  return flags.sort((a, b) => (b.value / b.totalPRs) - (a.value / a.totalPRs))
}

// Detect engineers with high rework cycles
export function detectHighRework(reworkProfiles) {
  const flags = []
  for (const [login, profile] of Object.entries(reworkProfiles)) {
    if (profile.median >= RED_FLAG_THRESHOLDS.highReworkCycles) {
      flags.push({
        type: 'high_rework',
        engineer: login,
        value: profile.median,
        label: `${profile.median.toFixed(1)} median rework cycles`,
        severity: profile.median >= 5 ? 'high' : 'medium',
      })
    }
  }
  return flags.sort((a, b) => b.value - a.value)
}

// Detect bus factor risk — engineers who are sole reviewers for critical files
export function detectBusFactorRisk(prs, reviewEventsMap, botAccounts = BOT_ACCOUNTS) {
  // Identify PRs where only one person reviewed
  const soleReviewerMap = {}  // reviewer → count of PRs where they were sole reviewer

  for (const pr of prs) {
    const reviews = reviewEventsMap.get(pr.number) || []
    const uniqueReviewers = new Set(
      reviews
        .map(r => r.user?.login)
        .filter(l => l && !botAccounts.has(l) && l !== pr.user?.login)
    )

    if (uniqueReviewers.size === 1) {
      const soleReviewer = [...uniqueReviewers][0]
      soleReviewerMap[soleReviewer] = (soleReviewerMap[soleReviewer] || 0) + 1
    }
  }

  const flags = []
  for (const [login, count] of Object.entries(soleReviewerMap)) {
    if (count >= 5) {
      flags.push({
        type: 'bus_factor',
        engineer: login,
        value: count,
        label: `Sole reviewer on ${count} PRs`,
        severity: count >= 10 ? 'high' : 'medium',
      })
    }
  }

  return flags.sort((a, b) => b.value - a.value)
}

// Aggregate all red flags
export function computeRedFlags(prs, reviewEventsMap, reworkProfiles, botAccounts = BOT_ACCOUNTS) {
  const knowledgeSilo = detectKnowledgeSiloRisk(prs, reviewEventsMap, botAccounts)
  const highRework = detectHighRework(reworkProfiles)

  return {
    knowledgeSilo: knowledgeSilo.slice(0, 8),
    highRework: highRework.slice(0, 8),
    total: knowledgeSilo.length + highRework.length,
  }
}
