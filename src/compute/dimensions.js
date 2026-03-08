import { BOT_ACCOUNTS, DEPENDENCY_PATTERNS } from '../constants.js'

// Dim 1 — Dark Matter Contribution
// Measures how often a reviewer's comment leads to a substantial code change
export function computeDarkMatter(prs, reviewCommentsMap, commitsMap) {
  const darkMatterEvents = {}
  const totalComments = {}

  for (const pr of prs) {
    const comments = reviewCommentsMap.get(pr.number) || []
    const commits = commitsMap.get(pr.number) || []

    // Group comments by reviewer
    const commentsByReviewer = {}
    for (const comment of comments) {
      const reviewer = comment.user?.login
      if (!reviewer || BOT_ACCOUNTS.has(reviewer)) continue
      if (!commentsByReviewer[reviewer]) commentsByReviewer[reviewer] = []
      commentsByReviewer[reviewer].push(comment)
      totalComments[reviewer] = (totalComments[reviewer] || 0) + 1
    }

    // For each reviewer, check if comments led to substantial commits
    for (const [reviewer, reviewerComments] of Object.entries(commentsByReviewer)) {
      for (const comment of reviewerComments) {
        const commentTime = new Date(comment.created_at).getTime()
        const commentFile = comment.path

        // Find commits after this comment within 48h that touch the same file
        const responsiveCommits = commits.filter(commit => {
          const commitTime = new Date(commit.commit?.author?.date || commit.commit?.committer?.date).getTime()
          return (
            commitTime > commentTime &&
            commitTime <= commentTime + 48 * 3600 * 1000
          )
        })

        // We count this as a dark matter event if any responsive commit exists
        // (approximation: we don't have per-commit file diffs in this layer)
        if (responsiveCommits.length > 0) {
          darkMatterEvents[reviewer] = (darkMatterEvents[reviewer] || 0) + 1
        }
      }
    }
  }

  // Compute score: events / total_comments, normalized
  const scores = {}
  for (const login of Object.keys(totalComments)) {
    const events = darkMatterEvents[login] || 0
    const total = totalComments[login] || 1
    scores[login] = {
      score: events / total,
      events,
      totalComments: total,
    }
  }

  return scores
}

// Dim 2 — Gravitational Pull
// Counts manual (non-CODEOWNERS, non-bot) review requests
export function computeGravitationalPull(prs, codeownerLogins, botAccounts = BOT_ACCOUNTS) {
  const scores = {}

  for (const pr of prs) {
    const requestedReviewers = pr.requested_reviewers || []
    const manualReviewers = requestedReviewers.filter(
      r => !codeownerLogins.has(r.login?.toLowerCase()) && !botAccounts.has(r.login)
    )

    for (const reviewer of manualReviewers) {
      const login = reviewer.login
      if (!login) continue
      scores[login] = (scores[login] || 0) + 1
    }
  }

  return scores
}

// Dim 3 — Rework Loop Depth
// Counts changes_requested → review_requested cycles per author
export function computeReworkProfiles(prs, reviewEventsMap) {
  const profiles = {}  // login → [rework_cycles per PR]

  for (const pr of prs) {
    const author = pr.user?.login
    if (!author || BOT_ACCOUNTS.has(author)) continue

    const events = reviewEventsMap.get(pr.number) || []

    // Sort chronologically
    const sorted = [...events].sort(
      (a, b) => new Date(a.submitted_at || a.created_at) - new Date(b.submitted_at || b.created_at)
    )

    let reworkCycles = 0
    let prevState = null

    for (const event of sorted) {
      const state = event.state?.toLowerCase()
      if (state === 'changes_requested') {
        prevState = 'changes_requested'
      } else if (state === 'dismissed' && prevState === 'changes_requested') {
        // Treat dismissed as re-request (GitHub dismisses on new commit)
        reworkCycles++
        prevState = null
      } else if ((state === 'approved' || state === 'commented') && prevState === 'changes_requested') {
        // Approved after changes — rework happened
        reworkCycles++
        prevState = null
      }
    }

    if (!profiles[author]) profiles[author] = []
    profiles[author].push(reworkCycles)
  }

  // Compute median per author
  const result = {}
  for (const [login, cycles] of Object.entries(profiles)) {
    const sorted = [...cycles].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid]
    result[login] = {
      median,
      cycles,
      prCount: cycles.length,
    }
  }

  return result
}

// Dim 4 — Incomplete Fix Rate (Layer 3, on-demand)
export function computeIncompleteFixes(issueEventsMap, prsByAuthor) {
  const incompleteFixes = {}
  const totalCloses = {}

  for (const [issueNumber, events] of issueEventsMap.entries()) {
    const closeEvent = events.find(e => e.event === 'closed')
    if (!closeEvent) continue

    const author = closeEvent.actor?.login
    if (!author) continue

    totalCloses[author] = (totalCloses[author] || 0) + 1

    const closeTime = new Date(closeEvent.created_at).getTime()
    const reopenEvent = events.find(e =>
      e.event === 'reopened' &&
      new Date(e.created_at).getTime() < closeTime + 14 * 86400 * 1000 &&
      new Date(e.created_at).getTime() > closeTime
    )

    if (reopenEvent) {
      incompleteFixes[author] = (incompleteFixes[author] || 0) + 1
    }
  }

  const result = {}
  for (const login of Object.keys(totalCloses)) {
    const fixes = incompleteFixes[login] || 0
    const total = totalCloses[login]
    result[login] = {
      rate: fixes / total,
      incompleteFixes: fixes,
      totalCloses: total,
    }
  }

  return result
}

// Dim 5 — Dependency Footprint (Layer 3, on-demand)
export function computeDependencyFootprint(prs) {
  const upstreamCount = {}
  const downstreamCount = {}

  // Build author → PRs map
  const authorPRs = {}
  for (const pr of prs) {
    const author = pr.user?.login
    if (!author) continue
    if (!authorPRs[author]) authorPRs[author] = []
    authorPRs[author].push(pr)
  }

  // Build PR number → author map
  const prAuthors = {}
  for (const pr of prs) {
    prAuthors[pr.number] = pr.user?.login
  }

  for (const pr of prs) {
    const author = pr.user?.login
    if (!author || BOT_ACCOUNTS.has(author)) continue

    const body = pr.body || ''
    const linesChanged = (pr.additions || 0) + (pr.deletions || 0)
    if (linesChanged < 50) continue

    // Reset regex lastIndex
    DEPENDENCY_PATTERNS.lastIndex = 0
    const matches = [...body.matchAll(/depends on #(\d+)|blocked by #(\d+)|follows #(\d+)|part of #(\d+)|after #(\d+)/gi)]

    for (const match of matches) {
      const refNum = parseInt(match[1] || match[2] || match[3] || match[4] || match[5])
      const upstreamAuthor = prAuthors[refNum]

      if (upstreamAuthor && upstreamAuthor !== author) {
        // This PR depends on another engineer's work → upstream engineer gets credit
        upstreamCount[upstreamAuthor] = (upstreamCount[upstreamAuthor] || 0) + 1
      }

      // Current PR is downstream (referencing others)
      downstreamCount[author] = (downstreamCount[author] || 0) + 1
    }
  }

  const result = {}
  const allLogins = new Set([...Object.keys(upstreamCount), ...Object.keys(downstreamCount)])
  for (const login of allLogins) {
    result[login] = {
      upstreamCount: upstreamCount[login] || 0,
      downstreamCount: downstreamCount[login] || 0,
    }
  }

  return result
}

// Classify PR work type by title/labels
export function classifyWorkType(pr) {
  const title = (pr.title || '').toLowerCase()
  const labels = (pr.labels || []).map(l => l.name.toLowerCase())

  if (labels.some(l => l.includes('bug') || l.includes('fix')) ||
      title.match(/^fix|^bug|^hotfix/)) return 'fix'
  if (labels.some(l => l.includes('refactor')) ||
      title.match(/^refactor|^clean|^tidy/)) return 'refactor'
  if (labels.some(l => l.includes('infra') || l.includes('ci') || l.includes('deps')) ||
      title.match(/^ci|^infra|^build|^deps|^chore/)) return 'infra'
  return 'feature'
}

// Percentile rank (0-1, higher = larger value)
export function percentileRank(value, allValues) {
  const sorted = [...allValues].sort((a, b) => a - b)
  const rank = sorted.filter(v => v < value).length
  return rank / (sorted.length - 1 || 1)
}
