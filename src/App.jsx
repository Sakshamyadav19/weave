import { useReducer, useEffect, useRef } from 'react'
import Header from './components/Header.jsx'
import LeaderboardPanel from './components/LeaderboardPanel.jsx'
import TrustNetworkPanel from './components/TrustNetworkPanel.jsx'
import ReviewReciprocity from './components/ReviewReciprocity.jsx'
import RedFlagsPanel from './components/RedFlagsPanel.jsx'
import ProfileCard from './components/ProfileCard.jsx'
import {
  fetchMergedPRsWithReviews,
  fetchPRDetails,
  fetchCodeowners,
  fetchFirstCommit,
  fetchIssueEvents,
  extractCodeownerLogins,
  batchFetch,
} from './api/github.js'
import {
  computeGravitationalPull,
  computeReworkProfiles,
  computeDarkMatter,
  computeIncompleteFixes,
  computeDependencyFootprint,
  classifyWorkType,
} from './compute/dimensions.js'
import { buildLeaderboard, buildNetworkEdges, getActiveEngineers } from './compute/leaderboard.js'
import { computeRedFlags } from './compute/redflags.js'
import { BOT_ACCOUNTS, TRUST_NETWORK_CAP } from './constants.js'
import './index.css'

// ─── Initial State ────────────────────────────────────────────────────────────

const initialState = {
  period: 90,
  layer1Status: 'idle',
  layer2Status: 'idle',
  incrementalStatus: 'idle',   // background fetch after layer 2
  prs: [],
  reviewEventsMap: new Map(),
  gravitationalScores: {},
  reworkProfiles: {},
  darkMatterScores: {},
  leaderboard: [],
  networkNodes: [],
  networkEdges: [],
  redFlags: null,
  hoveredEngineer: null,
  selectedEngineer: null,
  profileCardData: null,
  profileCardStatus: 'idle',
  lastFetched: null,
  codeownerLogins: new Set(),
  rateLimitReset: null,
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {
    case 'SET_PERIOD':
      return { ...initialState, period: action.payload }

    case 'LAYER1_START':
      return {
        ...state,
        layer1Status: 'loading',
        layer2Status: 'idle',
        incrementalStatus: 'idle',
        prs: [],
        reviewEventsMap: new Map(),
        leaderboard: [],
        networkNodes: [],
        networkEdges: [],
        redFlags: null,
        gravitationalScores: {},
        reworkProfiles: {},
        darkMatterScores: {},
      }

    case 'LAYER1_DONE':
      return {
        ...state,
        layer1Status: 'done',
        prs: action.prs,
        reviewEventsMap: action.reviewEventsMap,
        gravitationalScores: action.gravitationalScores,
        reworkProfiles: action.reworkProfiles,
        leaderboard: action.leaderboard,
        networkNodes: action.networkNodes,
        networkEdges: action.networkEdges,
        redFlags: action.redFlags,
        codeownerLogins: action.codeownerLogins,
        lastFetched: new Date(),
      }

    case 'LAYER1_ERROR':
      return { ...state, layer1Status: 'error' }

    case 'LAYER2_START':
      return { ...state, layer2Status: 'loading' }

    case 'LAYER2_DONE':
      return {
        ...state,
        layer2Status: 'done',
        darkMatterScores: action.darkMatterScores,
        leaderboard: action.leaderboard,
      }

    case 'LAYER2_ERROR':
      return { ...state, layer2Status: 'error' }

    case 'INCREMENTAL_START':
      return { ...state, incrementalStatus: 'loading' }

    case 'INCREMENTAL_DONE':
      return {
        ...state,
        incrementalStatus: 'done',
        prs: action.prs,
        reviewEventsMap: action.reviewEventsMap,
        gravitationalScores: action.gravitationalScores,
        reworkProfiles: action.reworkProfiles,
        leaderboard: action.leaderboard,
        networkNodes: action.networkNodes,
        networkEdges: action.networkEdges,
        redFlags: action.redFlags,
      }

    case 'INCREMENTAL_ERROR':
      return { ...state, incrementalStatus: 'error' }

    case 'SET_HOVERED':
      return { ...state, hoveredEngineer: action.login }

    case 'SELECT_ENGINEER':
      return {
        ...state,
        selectedEngineer: action.login,
        profileCardStatus: action.login ? 'loading' : 'idle',
        profileCardData: null,
      }

    case 'PROFILE_DONE':
      return { ...state, profileCardStatus: 'done', profileCardData: action.data }

    case 'RATE_LIMIT':
      return { ...state, rateLimitReset: action.resetAt }

    case 'CLEAR_RATE_LIMIT':
      return { ...state, rateLimitReset: null }

    default:
      return state
  }
}

// ─── Shared compute helper ────────────────────────────────────────────────────

function computeAll({ prs, reviewEventsMap, codeownerLogins, darkMatterScores, hasLayer2 }) {
  const gravitationalScores = computeGravitationalPull(prs, codeownerLogins, BOT_ACCOUNTS)
  const reworkProfiles = computeReworkProfiles(prs, reviewEventsMap)

  const prCounts = {}
  for (const pr of prs) {
    const author = pr.user?.login
    if (author && !BOT_ACCOUNTS.has(author)) {
      prCounts[author] = (prCounts[author] || 0) + 1
    }
  }

  const leaderboard = buildLeaderboard({
    darkMatterScores: darkMatterScores || {},
    gravitationalScores,
    reworkProfiles,
    prCounts,
    hasLayer2,
  })

  const networkNodes = getActiveEngineers(prs, reviewEventsMap, BOT_ACCOUNTS, TRUST_NETWORK_CAP)
  const networkEdges = buildNetworkEdges(prs, reviewEventsMap, prCounts, BOT_ACCOUNTS)
  const redFlags = computeRedFlags(prs, reviewEventsMap, reworkProfiles, BOT_ACCOUNTS)

  return { gravitationalScores, reworkProfiles, prCounts, leaderboard, networkNodes, networkEdges, redFlags }
}

// ─── Token Gate ───────────────────────────────────────────────────────────────

function TokenGate({ children }) {
  const token = import.meta.env.VITE_GITHUB_TOKEN
  if (!token || token === 'ghp_your_token_here') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-cream">
        <div className="border-4 border-black p-8 shadow-neo-xl max-w-lg w-full mx-4">
          <h1 className="font-black text-2xl mb-4 uppercase tracking-wider">Token Required</h1>
          <p className="font-bold text-sm mb-4 leading-relaxed">
            This dashboard needs a GitHub Personal Access Token to fetch data from the PostHog repository.
          </p>
          <div className="border-2 border-black bg-black text-neo-secondary p-3 font-mono text-sm mb-4">
            <div className="text-gray-400 text-xs mb-1"># .env (in project root)</div>
            <div>VITE_GITHUB_TOKEN=ghp_your_token_here</div>
          </div>
          <ol className="list-decimal list-inside text-sm font-bold space-y-1.5 mb-4">
            <li>Create a token at <code className="bg-neo-secondary px-1 border border-black">github.com/settings/tokens</code></li>
            <li>Needs: <code className="bg-neo-secondary px-1 border border-black">repo</code> (read) scope</li>
            <li>Copy <code className="bg-neo-secondary px-1 border border-black">.env.example</code> → <code className="bg-neo-secondary px-1 border border-black">.env</code></li>
            <li>Paste token and restart dev server</li>
          </ol>
          <div className="border-2 border-black p-3 bg-neo-secondary font-black text-sm">
            Then run: <code>npm run dev</code>
          </div>
        </div>
      </div>
    )
  }
  return children
}

// ─── Rate Limit Banner ────────────────────────────────────────────────────────

function RateLimitBanner({ resetAt, onClear }) {
  if (!resetAt) return null
  const seconds = Math.max(0, Math.ceil((resetAt * 1000 - Date.now()) / 1000))
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-neo-amber border-b-4 border-black
                    flex items-center justify-center gap-3 py-2 font-black text-sm">
      <span>⏳ GitHub rate limit reached — resuming in {seconds}s</span>
      <button
        onClick={onClear}
        className="border-2 border-black px-2 py-0.5 bg-white shadow-neo-sm text-xs
                   hover:-translate-y-0.5 hover:shadow-neo-md transition-all"
      >
        Dismiss
      </button>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const token = import.meta.env.VITE_GITHUB_TOKEN

  // Prevent concurrent fetches: store an abort flag per fetch session
  const abortFlagRef = useRef(null)
  // Track whether layer1 has been triggered for the current period
  const fetchedPeriodRef = useRef(null)
  // Always-current state snapshot for incremental fetch closure
  const currentStateRef = useRef(state)
  currentStateRef.current = state

  // ── Layer 1 ────────────────────────────────────────────────────────────────

  async function runLayer1(period) {
    // Abort any in-flight session
    if (abortFlagRef.current) abortFlagRef.current.cancelled = true
    const abort = { cancelled: false }
    abortFlagRef.current = abort

    dispatch({ type: 'LAYER1_START' })

    try {
      const codeownerRules = await fetchCodeowners(token)
      const codeownerLogins = extractCodeownerLogins(codeownerRules)
      if (abort.cancelled) return

      // Fetch first 200 merged PRs + reviews in a single GraphQL query
      const { prs, reviewEventsMap, hasMore, nextCursor } = await fetchMergedPRsWithReviews(token, period, { maxPRs: 200, cursor: null })
      if (abort.cancelled) return
      console.log(`[Layer 1] fetched ${prs.length} PRs (hasMore=${hasMore}, nextCursor=${nextCursor})`)

      const computed = computeAll({ prs, reviewEventsMap, codeownerLogins, darkMatterScores: {}, hasLayer2: false })

      dispatch({
        type: 'LAYER1_DONE',
        prs,
        reviewEventsMap,
        codeownerLogins,
        ...computed,
      })

      // Layer 2 — dark matter
      await runLayer2({ prs, reviewEventsMap, codeownerLogins, computed, abort })

      // Background incremental fetch (remaining PRs) — only if there are more
      if (hasMore && !abort.cancelled) {
        scheduleIncremental({ period, cursor: nextCursor, codeownerLogins, abort })
      }

    } catch (err) {
      if (abort.cancelled) return
      if (err.message === 'RATE_LIMIT') {
        dispatch({ type: 'RATE_LIMIT', resetAt: err.resetAt })
      }
      dispatch({ type: 'LAYER1_ERROR' })
      console.error('[Layer 1]', err)
    }
  }

  // ── Layer 2 ────────────────────────────────────────────────────────────────

  async function runLayer2({ prs, reviewEventsMap, codeownerLogins, computed, abort }) {
    dispatch({ type: 'LAYER2_START' })
    try {
      // Top 30 most-commented PRs (reduces API calls while still covering high-signal PRs)
      const top30 = [...prs].sort((a, b) => (b.comments || 0) - (a.comments || 0)).slice(0, 30)

      const prNumbers = top30.map(pr => pr.number)
      const { reviewCommentsMap, commitsMap } = await fetchPRDetails(token, prNumbers)

      if (abort.cancelled) return

      const darkMatterScores = computeDarkMatter(top30, reviewCommentsMap, commitsMap)

      const prCounts = {}
      for (const pr of prs) {
        const author = pr.user?.login
        if (author && !BOT_ACCOUNTS.has(author)) prCounts[author] = (prCounts[author] || 0) + 1
      }

      const leaderboard = buildLeaderboard({
        darkMatterScores,
        gravitationalScores: computed.gravitationalScores,
        reworkProfiles: computed.reworkProfiles,
        prCounts,
        hasLayer2: true,
      })

      dispatch({ type: 'LAYER2_DONE', darkMatterScores, leaderboard })
      console.log('[Layer 2] dark matter computed for', Object.keys(darkMatterScores).length, 'engineers')
    } catch (err) {
      if (abort.cancelled) return
      dispatch({ type: 'LAYER2_ERROR' })
      console.error('[Layer 2]', err)
    }
  }

  // ── Incremental Background Fetch ───────────────────────────────────────────

  function scheduleIncremental({ period, cursor, codeownerLogins, abort }) {
    const run = async () => {
      if (abort.cancelled) return
      dispatch({ type: 'INCREMENTAL_START' })

      let nextCursor = cursor

      try {
        while (nextCursor) {
          if (abort.cancelled) return

          const { prs: newPRs, reviewEventsMap, hasMore, nextCursor: nc } = await fetchMergedPRsWithReviews(token, period, {
            maxPRs: 200,
            cursor: nextCursor,
          })
          if (abort.cancelled) return
          console.log(`[Incremental] fetched ${newPRs.length} more PRs (hasMore=${hasMore})`)

          // Always read latest accumulated state from the ref
          const currentPRs = currentStateRef.current.prs || []
          const currentReviewMap = currentStateRef.current.reviewEventsMap || new Map()
          const currentDarkMatter = currentStateRef.current.darkMatterScores || {}
          const isLayer2Done = currentStateRef.current.layer2Status === 'done'

          const mergedPRs = [...currentPRs, ...newPRs]
          const mergedReviewMap = new Map([...currentReviewMap, ...reviewEventsMap])
          const computed = computeAll({
            prs: mergedPRs,
            reviewEventsMap: mergedReviewMap,
            codeownerLogins,
            darkMatterScores: currentDarkMatter,
            hasLayer2: isLayer2Done,
          })

          dispatch({
            type: 'INCREMENTAL_DONE',
            prs: mergedPRs,
            reviewEventsMap: mergedReviewMap,
            ...computed,
          })

          nextCursor = hasMore ? nc : null
        }

        console.log('[Incremental] all pages exhausted')
      } catch (err) {
        if (abort.cancelled) return
        dispatch({ type: 'INCREMENTAL_ERROR' })
        console.error('[Incremental]', err)
      }
    }

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(run, { timeout: 5000 })
    } else {
      setTimeout(run, 2000)
    }
  }

  // ── Layer 3 — Profile Card ─────────────────────────────────────────────────

  async function runLayer3(login) {
    if (!login || !state.prs.length) {
      dispatch({ type: 'PROFILE_DONE', data: null })
      return
    }
    try {
      const engineerPRs = state.prs.filter(pr => pr.user?.login === login)

      const workTypes = { feature: 0, fix: 0, refactor: 0, infra: 0 }
      for (const pr of engineerPRs) workTypes[classifyWorkType(pr)]++

      const depFootprint = computeDependencyFootprint(state.prs)
      const dependency = depFootprint[login] || null
      const reworkMedian = state.reworkProfiles[login]?.median ?? 0
      const gravitational = state.gravitationalScores[login] || 0
      const firstContribution = await fetchFirstCommit(token, login)

      // Collect issues referenced in this engineer's PRs
      const issueEventsMap = new Map()
      const referencedIssues = new Set()
      for (const pr of engineerPRs.slice(0, 15)) {
        const matches = [...(pr.body || '').matchAll(/(?:closes?|fixes?|resolves?)\s+#(\d+)/gi)]
        for (const m of matches) referencedIssues.add(parseInt(m[1]))
      }
      await batchFetch([...referencedIssues].slice(0, 8), async issueNum => {
        const events = await fetchIssueEvents(token, issueNum)
        issueEventsMap.set(issueNum, events)
      }, 4)

      const incompleteFixMap = computeIncompleteFixes(issueEventsMap, engineerPRs)
      const incompleteFix = incompleteFixMap[login] || null

      dispatch({
        type: 'PROFILE_DONE',
        data: {
          workTypes,
          dependency,
          incompleteFix,
          reworkMedian,
          gravitational,
          prCount: engineerPRs.length,
          firstContribution,
        },
      })
    } catch (err) {
      console.error('[Layer 3]', err)
      dispatch({ type: 'PROFILE_DONE', data: {} })
    }
  }

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token || token === 'ghp_your_token_here') return
    // Only fire when period actually changes (prevent StrictMode or re-render double-fire)
    if (fetchedPeriodRef.current === state.period) return
    fetchedPeriodRef.current = state.period
    runLayer1(state.period)
  }, [state.period]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state.selectedEngineer) runLayer3(state.selectedEngineer)
  }, [state.selectedEngineer]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handlePeriodChange = (p) => {
    fetchedPeriodRef.current = null  // allow re-fetch for new period
    dispatch({ type: 'SET_PERIOD', payload: p })
  }
  const handleHover = (login) => dispatch({ type: 'SET_HOVERED', login })
  const handleSelect = (login) => dispatch({ type: 'SELECT_ENGINEER', login })
  const handleDismiss = () => dispatch({ type: 'SELECT_ENGINEER', login: null })

  const activeCount = state.layer1Status === 'done'
    ? new Set([
        ...Object.keys(state.gravitationalScores),
        ...Object.keys(state.reworkProfiles),
      ]).size
    : 0

  return (
    <TokenGate>
      <div className="h-screen w-screen overflow-hidden flex flex-col bg-cream font-grotesk">
        <RateLimitBanner
          resetAt={state.rateLimitReset}
          onClear={() => dispatch({ type: 'CLEAR_RATE_LIMIT' })}
        />

        <Header
          period={state.period}
          onPeriodChange={handlePeriodChange}
          lastFetched={state.lastFetched}
          activeCount={activeCount}
          layer1Status={state.layer1Status}
          incrementalStatus={state.incrementalStatus}
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '52fr 48fr',
            height: 'calc(100vh - clamp(52px, 6vh, 72px))',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flex: '65 1 0', minHeight: 0, borderRight: '4px solid black', borderBottom: '4px solid black' }}>
              <LeaderboardPanel
                leaderboard={state.leaderboard}
                layer1Status={state.layer1Status}
                layer2Status={state.layer2Status}
                hoveredEngineer={state.hoveredEngineer}
                onHover={handleHover}
                onSelect={handleSelect}
              />
            </div>
            <div style={{ flex: '35 1 0', minHeight: 0, borderRight: '4px solid black', borderBottom: '4px solid black' }}>
              <RedFlagsPanel
                redFlags={state.redFlags}
                layer1Status={state.layer1Status}
                onSelect={handleSelect}
              />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ flex: '0 0 auto', borderRight: '4px solid black', borderBottom: '4px solid black' }}>
              <TrustNetworkPanel
                nodes={state.networkNodes}
                edges={state.networkEdges}
                scores={state.leaderboard}
                hoveredEngineer={state.hoveredEngineer}
                onHover={handleHover}
                onSelect={handleSelect}
                layer1Status={state.layer1Status}
              />
            </div>
            <div style={{ flex: '1 1 0', minHeight: 0, borderRight: '4px solid black', borderBottom: '4px solid black' }}>
              <ReviewReciprocity
                prs={state.prs}
                reviewEventsMap={state.reviewEventsMap}
                scores={state.leaderboard}
                hoveredEngineer={state.hoveredEngineer}
                onHover={handleHover}
                onSelect={handleSelect}
                layer1Status={state.layer1Status}
              />
            </div>
          </div>
        </div>

        <ProfileCard
          engineer={state.selectedEngineer}
          profileCardData={state.profileCardData}
          profileCardStatus={state.profileCardStatus}
          scores={state.leaderboard}
          onDismiss={handleDismiss}
        />
      </div>
    </TokenGate>
  )
}
