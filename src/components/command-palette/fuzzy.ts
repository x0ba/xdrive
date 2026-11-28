import { BUILTIN_SECTION_LABELS, BUILTIN_SECTION_ORDER } from './types'
import type {
  CommandItem,
  CommandSectionGroup,
  CommandSectionId,
  FuzzyMatchResult,
  RankedCommandItem,
} from './types'

const WORD_BOUNDARY_RE = /[\s/\-_.:]/
const LOWER_OR_DIGIT_RE = /[a-z0-9]/
const UPPER_RE = /[A-Z]/

const MAX_DP_MATRIX_CELLS = 16_384

export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ')
}

export function mergeRanges(
  ranges: ReadonlyArray<[number, number]>,
): Array<[number, number]> {
  if (ranges.length === 0) return []
  const sorted = ranges
    .filter(([start, end]) => end > start)
    .slice()
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (sorted.length === 0) return []

  const merged: Array<[number, number]> = [[sorted[0][0], sorted[0][1]]]
  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i]
    const last = merged[merged.length - 1]
    if (start <= last[1]) {
      if (end > last[1]) last[1] = end
    } else {
      merged.push([start, end])
    }
  }
  return merged
}

function indicesToRanges(
  indices: ReadonlyArray<number>,
): Array<[number, number]> {
  if (indices.length === 0) return []
  const ranges: Array<[number, number]> = []
  let start = indices[0]
  let end = indices[0] + 1
  for (let i = 1; i < indices.length; i++) {
    const idx = indices[i]
    if (idx === end) {
      end += 1
    } else {
      ranges.push([start, end])
      start = idx
      end = idx + 1
    }
  }
  ranges.push([start, end])
  return ranges
}

function computeBoundaryBonuses(target: string): number[] {
  const bonuses = new Array<number>(target.length).fill(0)
  for (let j = 0; j < target.length; j++) {
    if (j === 0) {
      bonuses[j] = 45
      continue
    }
    const prev = target[j - 1]
    const curr = target[j]
    if (WORD_BOUNDARY_RE.test(prev)) {
      bonuses[j] = 35
    } else if (LOWER_OR_DIGIT_RE.test(prev) && UPPER_RE.test(curr)) {
      bonuses[j] = 30
    }
  }
  return bonuses
}

function isSubsequence(needleLower: string, haystackLower: string): boolean {
  let qi = 0
  for (let ti = 0; ti < haystackLower.length && qi < needleLower.length; ti++) {
    if (haystackLower[ti] === needleLower[qi]) qi += 1
  }
  return qi === needleLower.length
}

function greedySubsequenceMatch(
  needleLower: string,
  target: string,
  targetLower: string,
  bonuses: number[],
): FuzzyMatchResult | null {
  const indices: number[] = []
  let qi = 0
  for (let ti = 0; ti < targetLower.length && qi < needleLower.length; ti++) {
    if (targetLower[ti] === needleLower[qi]) {
      indices.push(ti)
      qi += 1
    }
  }
  if (qi !== needleLower.length) return null

  let score = 0
  let consecutive = 0
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i]
    const prevIdx = i > 0 ? indices[i - 1] : -1
    if (prevIdx !== -1 && idx === prevIdx + 1) {
      consecutive += 1
    } else {
      consecutive = 1
    }
    score += 10 + bonuses[idx]
    if (consecutive > 1) {
      score += 18 + Math.min(consecutive - 1, 4) * 4
    }
    if (prevIdx !== -1 && idx > prevIdx + 1) {
      score -= (idx - prevIdx - 1) * 2
    }
  }
  score -= Math.min(indices[0], 20) * 0.5
  score -= target.length * 0.1
  return {
    score,
    ranges: indicesToRanges(indices),
  }
}

function dpSubsequenceMatch(
  needleLower: string,
  target: string,
  targetLower: string,
  bonuses: number[],
): FuzzyMatchResult | null {
  const qLen = needleLower.length
  const tLen = targetLower.length
  const NEG_INF = -1e9

  const scores = new Float64Array(qLen * tLen).fill(NEG_INF)
  const consecutiveRuns = new Int16Array(qLen * tLen).fill(0)
  const prevChoice = new Int32Array(qLen * tLen).fill(-1)

  for (let j = 0; j < tLen; j++) {
    if (targetLower[j] === needleLower[0]) {
      scores[j] = 10 + bonuses[j] - Math.min(j, 20) * 0.5
      consecutiveRuns[j] = 1
    }
  }

  for (let i = 1; i < qLen; i++) {
    const rowOffset = i * tLen
    const prevRowOffset = (i - 1) * tLen
    let bestNonConsecScore = NEG_INF
    let bestNonConsecIdx = -1

    for (let j = i; j < tLen; j++) {
      // Allow transitions from any previous match k < j - 1 via running max.
      if (j >= 2) {
        const k = j - 2
        const candidate = scores[prevRowOffset + k]
        if (candidate > NEG_INF / 2) {
          const penalized = candidate + k * 2
          if (penalized > bestNonConsecScore) {
            bestNonConsecScore = penalized
            bestNonConsecIdx = k
          }
        }
      }

      if (targetLower[j] !== needleLower[i]) continue

      let bestScore = NEG_INF
      let bestPrev = -1
      let bestRun = 1

      // Consecutive transition from j - 1
      const diagScore = scores[prevRowOffset + (j - 1)]
      if (diagScore > NEG_INF / 2) {
        const nextRun = consecutiveRuns[prevRowOffset + (j - 1)] + 1
        const bonus = 10 + bonuses[j] + 18 + Math.min(nextRun - 1, 4) * 4
        const total = diagScore + bonus
        if (total > bestScore) {
          bestScore = total
          bestPrev = j - 1
          bestRun = nextRun
        }
      }

      // Non-consecutive transition from best k <= j - 2
      if (bestNonConsecIdx !== -1) {
        const gapPenalty = (j - 1) * 2
        const total = bestNonConsecScore - gapPenalty + 10 + bonuses[j]
        if (total > bestScore) {
          bestScore = total
          bestPrev = bestNonConsecIdx
          bestRun = 1
        }
      }

      if (bestPrev !== -1) {
        scores[rowOffset + j] = bestScore
        consecutiveRuns[rowOffset + j] = bestRun
        prevChoice[rowOffset + j] = bestPrev
      }
    }
  }

  const lastRowOffset = (qLen - 1) * tLen
  let endIdx = -1
  let maxScore = NEG_INF
  for (let j = qLen - 1; j < tLen; j++) {
    const val = scores[lastRowOffset + j]
    if (val > maxScore) {
      maxScore = val
      endIdx = j
    }
  }

  if (endIdx === -1 || maxScore <= NEG_INF / 2) return null

  const indices = new Array<number>(qLen)
  let currJ = endIdx
  for (let i = qLen - 1; i >= 0; i--) {
    indices[i] = currJ
    currJ = prevChoice[i * tLen + currJ]
  }

  return {
    score: maxScore - target.length * 0.1,
    ranges: indicesToRanges(indices),
  }
}

function matchSinglePhrase(
  needle: string,
  target: string,
): FuzzyMatchResult | null {
  const qLower = needle.toLowerCase()
  const tLower = target.toLowerCase()
  if (qLower.length === 0) return { score: 0, ranges: [] }
  if (qLower.length > tLower.length) return null

  if (qLower === tLower) {
    return {
      score: 1000 + Math.max(0, 40 - target.length),
      ranges: [[0, target.length]],
    }
  }

  if (tLower.startsWith(qLower)) {
    return {
      score: 520 + qLower.length * 22 + Math.max(0, 40 - target.length),
      ranges: [[0, qLower.length]],
    }
  }

  const bonuses = computeBoundaryBonuses(target)

  // Prefer contiguous substring matches when present, preferring word-boundary occurrences.
  let bestSubstrIdx = -1
  let bestSubstrBonus = -1
  let searchFrom = 0
  while (searchFrom <= tLower.length - qLower.length) {
    const found = tLower.indexOf(qLower, searchFrom)
    if (found === -1) break
    const boundary = bonuses[found]
    if (boundary > bestSubstrBonus) {
      bestSubstrBonus = boundary
      bestSubstrIdx = found
    }
    searchFrom = found + 1
  }

  if (bestSubstrIdx !== -1) {
    const score =
      260 +
      qLower.length * 20 +
      bestSubstrBonus -
      Math.min(bestSubstrIdx, 20) * 0.5 -
      target.length * 0.1
    return {
      score,
      ranges: [[bestSubstrIdx, bestSubstrIdx + qLower.length]],
    }
  }

  if (!isSubsequence(qLower, tLower)) return null

  if (qLower.length * tLower.length <= MAX_DP_MATRIX_CELLS) {
    return dpSubsequenceMatch(qLower, target, tLower, bonuses)
  }
  return greedySubsequenceMatch(qLower, target, tLower, bonuses)
}

/**
 * Score `query` against `target` with exact, prefix, substring, word-boundary,
 * camelCase, consecutive, and multi-token subsequence matching.
 */
export function fuzzyMatch(
  query: string,
  target: string,
): FuzzyMatchResult | null {
  const normalized = normalizeQuery(query)
  if (!normalized) return { score: 0, ranges: [] }
  if (!target) return null

  const wholeMatch = matchSinglePhrase(normalized, target)
  const tokens = normalized.split(' ').filter(Boolean)
  if (tokens.length <= 1) {
    return wholeMatch
  }

  const tokenMatches: FuzzyMatchResult[] = []
  for (const token of tokens) {
    const match = matchSinglePhrase(token, target)
    if (!match) return wholeMatch
    tokenMatches.push(match)
  }

  // Scale down multi-token split score so exact phrase / prefix matches still win.
  const combinedTokenScore =
    tokenMatches.reduce((sum, match) => sum + match.score, 0) * 0.58
  const combinedRanges = mergeRanges(tokenMatches.flatMap((m) => m.ranges))

  if (wholeMatch && wholeMatch.score >= combinedTokenScore) {
    return wholeMatch
  }
  return {
    score: combinedTokenScore,
    ranges: combinedRanges,
  }
}

export function parseRecencyMs(updatedAt?: number | string): number {
  if (typeof updatedAt === 'number') {
    return Number.isFinite(updatedAt) ? updatedAt : 0
  }
  if (typeof updatedAt === 'string') {
    const trimmed = updatedAt.trim()
    if (!trimmed) return 0
    const parsed = Date.parse(trimmed)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

function bestFieldMatch(
  needle: string,
  item: CommandItem,
): {
  weightedScore: number
  labelRanges: Array<[number, number]>
} | null {
  let bestScore = -Infinity
  let labelRanges: Array<[number, number]> = []

  const labelMatch = fuzzyMatch(needle, item.label)
  if (labelMatch) {
    bestScore = labelMatch.score
    labelRanges = labelMatch.ranges
  }

  if (item.keywords && item.keywords.length > 0) {
    for (const keyword of item.keywords) {
      const kwMatch = fuzzyMatch(needle, keyword)
      if (kwMatch) {
        const weighted = kwMatch.score * 0.8
        if (weighted > bestScore) {
          bestScore = weighted
        }
      }
    }
  }

  if (item.subtitle) {
    const subMatch = fuzzyMatch(needle, item.subtitle)
    if (subMatch) {
      const weighted = subMatch.score * 0.65
      if (weighted > bestScore) {
        bestScore = weighted
      }
    }
  }

  if (item.href) {
    const hrefMatch = fuzzyMatch(needle, item.href)
    if (hrefMatch) {
      const weighted = hrefMatch.score * 0.5
      if (weighted > bestScore) {
        bestScore = weighted
      }
    }
  }

  if (bestScore === -Infinity) return null
  return { weightedScore: bestScore, labelRanges }
}

export function scoreCommandItem(
  query: string,
  item: CommandItem,
): { matchScore: number; labelRanges: Array<[number, number]> } | null {
  const normalized = normalizeQuery(query)
  if (!normalized) {
    return {
      matchScore: item.score ?? 0,
      labelRanges: [],
    }
  }

  if (item.alwaysMatch) {
    const labelMatch = fuzzyMatch(normalized, item.label)
    return {
      matchScore: Math.max(item.score ?? 0, labelMatch ? labelMatch.score : 0),
      labelRanges: labelMatch?.ranges ?? [],
    }
  }

  const singleField = bestFieldMatch(normalized, item)
  const tokens = normalized.split(' ').filter(Boolean)

  if (tokens.length > 1) {
    let allTokensMatched = true
    let tokenScoreSum = 0
    const tokenLabelRanges: Array<[number, number]> = []

    for (const token of tokens) {
      const tokenBest = bestFieldMatch(token, item)
      if (!tokenBest) {
        allTokensMatched = false
        break
      }
      tokenScoreSum += tokenBest.weightedScore
      if (tokenBest.labelRanges.length > 0) {
        tokenLabelRanges.push(...tokenBest.labelRanges)
      } else {
        const directLabel = fuzzyMatch(token, item.label)
        if (directLabel) tokenLabelRanges.push(...directLabel.ranges)
      }
    }

    if (allTokensMatched) {
      const crossFieldScore = tokenScoreSum * 0.55
      if (!singleField || crossFieldScore > singleField.weightedScore) {
        return {
          matchScore: crossFieldScore + (item.score ?? 0),
          labelRanges: mergeRanges(tokenLabelRanges),
        }
      }
    }
  }

  if (!singleField) return null
  return {
    matchScore: singleField.weightedScore + (item.score ?? 0),
    labelRanges: singleField.labelRanges,
  }
}

export function rankCommandItems(
  query: string,
  entries: ReadonlyArray<{
    item: CommandItem
    sourceId: string
    sourcePriority: number
  }>,
): RankedCommandItem[] {
  const byId = new Map<string, RankedCommandItem>()

  for (const entry of entries) {
    const scored = scoreCommandItem(query, entry.item)
    if (!scored) continue

    const candidate: RankedCommandItem = {
      item: entry.item,
      sourceId: entry.sourceId,
      sourcePriority: entry.sourcePriority,
      matchScore: scored.matchScore,
      recencyMs: parseRecencyMs(entry.item.updatedAt),
      labelRanges: scored.labelRanges,
    }

    const existing = byId.get(entry.item.id)
    if (!existing) {
      byId.set(entry.item.id, candidate)
      continue
    }

    if (
      candidate.matchScore > existing.matchScore ||
      (candidate.matchScore === existing.matchScore &&
        candidate.sourcePriority > existing.sourcePriority)
    ) {
      byId.set(entry.item.id, candidate)
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    if (b.matchScore !== a.matchScore) {
      return b.matchScore - a.matchScore
    }
    if (b.recencyMs !== a.recencyMs) {
      return b.recencyMs - a.recencyMs
    }
    if (b.sourcePriority !== a.sourcePriority) {
      return b.sourcePriority - a.sourcePriority
    }
    return a.item.label.localeCompare(b.item.label)
  })
}

export function groupRankedItems(
  query: string,
  ranked: ReadonlyArray<RankedCommandItem>,
): CommandSectionGroup[] {
  const hasQuery = normalizeQuery(query).length > 0
  const groupsMap = new Map<
    CommandSectionId,
    {
      id: CommandSectionId
      label: string
      items: RankedCommandItem[]
      maxScore: number
      maxPriority: number
    }
  >()

  for (const entry of ranked) {
    const id = entry.item.section
    let group = groupsMap.get(id)
    if (!group) {
      group = {
        id,
        label:
          entry.item.sectionLabel ?? BUILTIN_SECTION_LABELS[id] ?? String(id),
        items: [],
        maxScore: entry.matchScore,
        maxPriority: entry.sourcePriority,
      }
      groupsMap.set(id, group)
    }
    group.items.push(entry)
    if (entry.matchScore > group.maxScore) group.maxScore = entry.matchScore
    if (entry.sourcePriority > group.maxPriority) {
      group.maxPriority = entry.sourcePriority
    }
  }

  const orderIndex = (id: CommandSectionId): number => {
    const idx = BUILTIN_SECTION_ORDER.indexOf(id)
    return idx === -1 ? BUILTIN_SECTION_ORDER.length : idx
  }

  return Array.from(groupsMap.values())
    .sort((a, b) => {
      if (hasQuery && b.maxScore !== a.maxScore) {
        return b.maxScore - a.maxScore
      }
      const orderDiff = orderIndex(a.id) - orderIndex(b.id)
      if (orderDiff !== 0) return orderDiff
      if (b.maxPriority !== a.maxPriority) {
        return b.maxPriority - a.maxPriority
      }
      return a.label.localeCompare(b.label)
    })
    .map(({ id, label, items }) => ({ id, label, items }))
}

export function splitHighlightRanges(
  text: string,
  ranges: ReadonlyArray<[number, number]>,
): Array<{ text: string; matched: boolean }> {
  if (!text) return []
  const clamped = mergeRanges(
    ranges
      .map(([start, end]): [number, number] => [
        Math.max(0, Math.min(text.length, start)),
        Math.max(0, Math.min(text.length, end)),
      ])
      .filter(([start, end]) => end > start),
  )

  if (clamped.length === 0) {
    return [{ text, matched: false }]
  }

  const segments: Array<{ text: string; matched: boolean }> = []
  let cursor = 0
  for (const [start, end] of clamped) {
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), matched: false })
    }
    segments.push({ text: text.slice(start, end), matched: true })
    cursor = end
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), matched: false })
  }
  return segments
}
