// GitHub REST API v3 client

export async function githubFetch(path, token, params = {}) {
  const url = new URL(`https://api.github.com${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })

  if (res.status === 403 || res.status === 429) {
    const resetAt = res.headers.get('X-RateLimit-Reset')
    const remaining = res.headers.get('X-RateLimit-Remaining')
    if (remaining === '0' && resetAt) {
      throw Object.assign(new Error('RATE_LIMIT'), { resetAt: parseInt(resetAt) })
    }
  }

  if (res.status === 401) {
    throw Object.assign(new Error('INVALID_TOKEN'), { status: 401 })
  }

  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${path}`)
  }

  return res.json()
}

export async function fetchAllPages(path, token, params = {}) {
  const results = []
  let page = 1
  while (true) {
    const data = await githubFetch(path, token, { ...params, per_page: 100, page })
    if (!Array.isArray(data)) break
    results.push(...data)
    if (data.length < 100) break
    page++
  }
  return results
}

// ─── GraphQL client ───────────────────────────────────────────────────────────

async function graphqlFetch(query, variables, token) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  if (res.status === 401) throw Object.assign(new Error('INVALID_TOKEN'), { status: 401 })
  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}`)
  const json = await res.json()
  if (json.errors?.length) {
    const msg = json.errors[0].message
    if (msg.includes('rate limit')) throw Object.assign(new Error('RATE_LIMIT'), { resetAt: null })
    throw new Error(`GraphQL error: ${msg}`)
  }
  if (json.data?.rateLimit) {
    const { cost, remaining, resetAt } = json.data.rateLimit
    console.log(`[GraphQL] cost=${cost} remaining=${remaining} reset=${new Date(resetAt).toLocaleTimeString()}`)
    if (remaining < 50) throw Object.assign(new Error('RATE_LIMIT'), { resetAt: Math.floor(new Date(resetAt).getTime() / 1000) })
  }
  return json.data
}

// ─── GraphQL response normalizers ─────────────────────────────────────────────

function normalizePR(node) {
  return {
    number: node.number,
    title: node.title,
    body: node.body,
    additions: node.additions,
    deletions: node.deletions,
    merged_at: node.mergedAt,
    updated_at: node.updatedAt,
    comments: node.comments.totalCount,
    user: { login: node.author?.login },
    labels: node.labels.nodes,
    files: node.files?.nodes?.map(n => n.path) || [],
    requested_reviewers: node.reviewRequests.nodes
      .map(n => ({ login: n.requestedReviewer?.login }))
      .filter(r => r.login),
  }
}

function normalizeReview(r) {
  return {
    user: { login: r.author?.login },
    state: r.state.toLowerCase(),
    submitted_at: r.submittedAt,
  }
}

// ─── Layer 1: Merged PRs + reviews in one GraphQL query ──────────────────────

const MERGED_PRS_QUERY = `
  query GetMergedPRs($cursor: String) {
    rateLimit { cost remaining resetAt }
    repository(owner: "PostHog", name: "posthog") {
      pullRequests(first: 100, after: $cursor, states: MERGED,
                   orderBy: { field: UPDATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number title body additions deletions mergedAt updatedAt
          comments { totalCount }
          author { login }
          labels(first: 10) { nodes { name } }
          files(first: 10) { nodes { path } }
          reviewRequests(first: 20) {
            nodes { requestedReviewer { ... on User { login } } }
          }
          reviews(first: 50) {
            nodes { author { login } state submittedAt }
          }
        }
      }
    }
  }
`

// Fetch a capped batch of merged PRs within `days` days, starting from `cursor`.
// Returns { prs, reviewEventsMap, hasMore, nextCursor } so callers can resume incrementally.
export async function fetchMergedPRsWithReviews(token, days, { maxPRs = 200, cursor = null } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const allPRs = []
  const reviewEventsMap = new Map()
  let currentCursor = cursor

  while (true) {
    const data = await graphqlFetch(MERGED_PRS_QUERY, { cursor: currentCursor }, token)
    const pullRequests = data.repository.pullRequests

    for (const node of pullRequests.nodes) {
      if (!node.mergedAt) continue
      // Past the time window — stop
      if (new Date(node.mergedAt) < new Date(since)) {
        return { prs: allPRs, reviewEventsMap, hasMore: false, nextCursor: null }
      }
      allPRs.push(normalizePR(node))
      reviewEventsMap.set(node.number, node.reviews.nodes.map(normalizeReview))
      // Hit the cap — caller can resume from next page cursor
      if (allPRs.length >= maxPRs) {
        return {
          prs: allPRs,
          reviewEventsMap,
          hasMore: true,
          nextCursor: pullRequests.pageInfo.endCursor,
        }
      }
    }

    if (!pullRequests.pageInfo.hasNextPage) {
      return { prs: allPRs, reviewEventsMap, hasMore: false, nextCursor: null }
    }

    currentCursor = pullRequests.pageInfo.endCursor
  }
}

// ─── Layer 2: PR details (review comments + commits) in batched GraphQL ──────

// Fetch review comments and commits for a list of PR numbers.
// Batches 5 PRs per query (30 PRs → 6 queries).
// Returns { reviewCommentsMap: Map<number, comment[]>, commitsMap: Map<number, commit[]> }
export async function fetchPRDetails(token, prNumbers) {
  const reviewCommentsMap = new Map()
  const commitsMap = new Map()
  const chunkSize = 5

  for (let i = 0; i < prNumbers.length; i += chunkSize) {
    const chunk = prNumbers.slice(i, i + chunkSize)
    const fields = `
      reviews(first: 30) {
        nodes {
          author { login }
          comments(first: 30) {
            nodes { path createdAt author { login } }
          }
        }
      }
      commits(first: 100) {
        nodes { commit { authoredDate committedDate } }
      }
    `
    const aliases = chunk.map(n => `pr${n}: pullRequest(number: ${n}) { ${fields} }`).join('\n')
    const query = `query { rateLimit { cost remaining resetAt } repository(owner:"PostHog",name:"posthog") { ${aliases} } }`

    const data = await graphqlFetch(query, {}, token)
    const repo = data.repository

    for (const n of chunk) {
      const pr = repo[`pr${n}`]
      if (!pr) continue
      const comments = pr.reviews.nodes.flatMap(r =>
        r.comments.nodes.map(c => ({
          user: { login: r.author?.login },
          created_at: c.createdAt,
          path: c.path,
        }))
      )
      const commits = pr.commits.nodes.map(cn => ({
        commit: {
          author: { date: cn.commit.authoredDate },
          committer: { date: cn.commit.committedDate },
        },
      }))
      reviewCommentsMap.set(n, comments)
      commitsMap.set(n, commits)
    }
  }

  return { reviewCommentsMap, commitsMap }
}

// ─── Layer 3: REST (low-volume, on-demand) ────────────────────────────────────

// Fetch issue timeline events (for incomplete fix rate)
export async function fetchIssueEvents(token, issueNumber) {
  try {
    return await githubFetch(`/repos/PostHog/posthog/issues/${issueNumber}/events`, token, {
      per_page: 100,
    })
  } catch (err) {
    console.error(`[fetchIssueEvents] issue #${issueNumber}:`, err.message)
    return []
  }
}

// Fetch user's first contribution year via a single-item commit search
export async function fetchFirstCommit(token, login) {
  try {
    const data = await githubFetch('/repos/PostHog/posthog/commits', token, {
      author: login,
      per_page: 1,
    })
    if (!Array.isArray(data) || data.length === 0) return null
    return data[0]?.commit?.author?.date || null
  } catch (err) {
    console.error(`[fetchFirstCommit] ${login}:`, err.message)
    return null
  }
}

// Parse CODEOWNERS file content
export async function fetchCodeowners(token) {
  const tryPath = async (path) => {
    const data = await githubFetch(path, token)
    if (!data.content) return []
    const content = atob(data.content.replace(/\n/g, ''))
    return parseCodeowners(content)
  }

  try {
    return await tryPath('/repos/PostHog/posthog/contents/.github/CODEOWNERS')
  } catch {
    try {
      return await tryPath('/repos/PostHog/posthog/contents/CODEOWNERS')
    } catch (err) {
      console.error('[fetchCodeowners]', err.message)
      return []
    }
  }
}

function parseCodeowners(content) {
  const rules = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 2) continue
    const pattern = parts[0]
    const owners = parts.slice(1).map(o => o.replace('@', '').toLowerCase())
    rules.push({ pattern, owners })
  }
  return rules
}

export function extractCodeownerLogins(rules) {
  const logins = new Set()
  for (const rule of rules) {
    for (const owner of rule.owners) {
      if (!owner.includes('/')) logins.add(owner)
    }
  }
  return logins
}

// Batch fetch with concurrency control and abort support
export async function batchFetch(items, fetchFn, concurrency = 8, abortFlag = null) {
  const results = []
  for (let i = 0; i < items.length; i += concurrency) {
    if (abortFlag?.cancelled) break
    const chunk = items.slice(i, i + concurrency)
    const chunkResults = await Promise.all(
      chunk.map(item => fetchFn(item).catch(err => {
        console.error('[batchFetch] item error:', err.message)
        return null
      }))
    )
    results.push(...chunkResults)
  }
  return results
}
