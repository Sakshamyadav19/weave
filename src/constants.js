const KNOWN_ORG_BOTS = new Set([
  'posthog-bot',
  'semantic-release-bot',
  'CLAassistant',
  'greptile-app',
  'greptile-apps',
])

export function isBotAccount(login) {
  return login.endsWith('[bot]') || KNOWN_ORG_BOTS.has(login)
}

export const BOT_ACCOUNTS = { has: (login) => isBotAccount(login) }

export const DIMENSION_COLORS = {
  darkMatter: '#7C3AED',
  gravitational: '#F5A623',
  rework: '#10B981',
  feature: '#F5A623',
  fix: '#EF4444',
  refactor: '#7C3AED',
  infra: '#0EA5E9',
}

export const MIN_PRS = 5
export const LEADERBOARD_CAP = 10
export const TRUST_NETWORK_CAP = 20

export const DEPENDENCY_PATTERNS = /depends on #(\d+)|blocked by #(\d+)|follows #(\d+)|part of #(\d+)|after #(\d+)/gi

export const WEIGHTS = {
  darkMatter: 0.4,
  gravitational: 0.35,
  rework: 0.25,
}

export const RED_FLAG_THRESHOLDS = {
  knowledgeSiloThreshold: 0.8,   // reviewer concentration ratio to flag (80%)
  knowledgeSiloMinPRs: 3,        // min reviewed PRs in a module before flagging
  staleDays: 7,                  // days since last activity to be "stale"
  highReworkCycles: 3,           // rework cycles to flag
}
