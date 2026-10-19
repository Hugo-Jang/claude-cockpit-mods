// 순수 함수와 상수 모음: API에 의존하지 않아 테스트에서 그대로 검증한다.

// ── 상수 ──

export const THRESHOLDS = {
  weather: { cloudy: 100_000, rain: 200_000, storm: 400_000 },
  rate: { warn: 70, danger: 90 },
  modelConfirmTokens: 200_000,
  confirmMs: 10_000,
  settleMs: 1_500,
} as const

export const COLORS = {
  rain: 'yellow',
  storm: 'red',
  ok: 'green',
  warn: 'yellow',
  danger: 'red',
  effort: 'cyan',
  planBar: 'cyan',
  confirm: 'yellow',
  mismatch: 'yellow',
  border: 'cyan',
} as const

// 타입 정의의 turn.step effort 문자열 값만 쓴다.
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type Effort = (typeof EFFORTS)[number]

// 모델 선택지로 보여 줄 별칭. 성능이 낮은 것부터 늘어놓는다. 별칭은 Claude Code가 항상 최신 모델로 풀어 준다.
export const MODELS = ['haiku', 'sonnet', 'opus'] as const

// config 행의 options 중 위 별칭과 겹치는 것만, MODELS의 순서대로 남긴다. 없는 것은 만들어 넣지 않는다.
export const pickModels = (options: readonly string[]): string[] => MODELS.filter(m => options.includes(m))

export const STRINGS = {
  noData: 'No data',
  dash: '-',
  limit5h: '5h',
  limitWeekly: 'Weekly',
  plan: 'Plan',
  allDone: '✔ All done',
  working: 'Claude is working. Try again when it finishes.',
  model: 'Model',
  effort: 'Effort',
  resume: 'Resume',
  rewind: 'Rewind',
  compact: 'Compact',
  clear: 'Clear',
  yes: 'Yes',
  no: 'No',
  close: 'Close',
  menuModel: 'Model ▸',
  menuEffort: 'Effort ▸',
  pressEnter: 'Press Enter to run it.',
  confirmResume: 'This opens the session picker. Run it?',
  confirmCompact: 'This summarizes the conversation to free context. Run it?',
  confirmClear: 'This clears the whole conversation. Run it?',
  confirmRewind: 'This opens the rewind menu. Run it?',
  confirmModel: 'Switch model to {X}? The cache is rebuilt, so the next turn may use more.',
  modelFailed: "Couldn't switch the model. Use /model instead.",
  modelTooBig: "Context is larger than this model's window. Run Compact.",
  actionFailed: "Couldn't run {Action}. Type /{action} instead.",
  statusDescription: 'Show cockpit values and the last working run path',
  effortSet: 'Effort set to {X}.',
  effortNextRequest: 'Applies from the next request.',
} as const

export type StringKey = keyof typeof STRINGS

export const ACTION_STRINGS = {
  resume: STRINGS.resume,
  rewind: STRINGS.rewind,
  compact: STRINGS.compact,
  clear: STRINGS.clear,
} as const

// 문구를 키로 꺼내고 {이름} 자리를 채운다.
export const text = (key: StringKey, vars: Record<string, string> = {}): string =>
  STRINGS[key].replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? '')

// ── 글자 폭 ──

const WIDE_ICONS = new Set(['☀', '☁', '☂', '⛈'])

// 터미널 칸 수: 날씨 아이콘과 한글·한자·전각 문자는 2칸으로 센다.
export const textWidth = (s: string): number => {
  let width = 0
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    const isWide =
      WIDE_ICONS.has(ch) ||
      (c >= 0x1100 && c <= 0x11ff) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xff00 && c <= 0xff60)
    width += isWide ? 2 : 1
  }
  return width
}

// 폭 안에 들어가도록 끝을 …로 줄인다.
export const truncate = (s: string, width: number): string => {
  if (textWidth(s) <= width) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch) + 1 > width) break
    out += ch
  }
  return `${out}…`
}

// ── 조각(색을 입힐 글자 묶음) ──

export type Seg = { text: string; color?: string; dim?: boolean; bold?: boolean }

export const segWidth = (segs: readonly Seg[]): number => segs.reduce((sum, s) => sum + textWidth(s.text), 0)

export const SEPARATOR: Seg = { text: ' │ ', dim: true }

const join = (groups: readonly (readonly Seg[])[]): Seg[] =>
  groups.flatMap((group, i) => (i === 0 ? [...group] : [SEPARATOR, ...group]))

// ── 포맷 ──

// 1,000 미만은 정수, 10,000 미만은 소수점 한 자리 k, 그 이상은 정수 k, 100만 이상은 M(.0 생략).
export const fmtTokens = (n: number): string => {
  if (n < 1000) return String(Math.round(n))
  if (n < 10_000) {
    const k = Math.round(n / 100) / 10
    if (k < 10) return `${k}k`
  }
  const k = Math.round(n / 1000)
  if (k < 1000) return `${k}k`
  return `${Number((n / 1_000_000).toFixed(1))}M`
}

export const fmtDelta = (n: number): string => `${n >= 0 ? '+' : '-'}${fmtTokens(Math.abs(n))}`

export type Weather = { icon: string; word: string; color?: string }

export const weatherOf = (tokens: number): Weather =>
  tokens < THRESHOLDS.weather.cloudy
    ? { icon: '☀', word: 'Sunny' }
    : tokens < THRESHOLDS.weather.rain
      ? { icon: '☁', word: 'Cloudy' }
      : tokens < THRESHOLDS.weather.storm
        ? { icon: '☂', word: 'Rain', color: COLORS.rain }
        : { icon: '⛈', word: 'Storm', color: COLORS.storm }

// 컨텍스트 막대: 10칸, floor(percent / 10), 토큰이 있으면 최소 1칸.
export const contextCells = (percent: number, tokens: number): number => {
  const filled = Math.min(10, Math.max(0, Math.floor(percent / 10)))
  return tokens > 0 ? Math.max(1, filled) : filled
}

// 계획 막대: 7칸, round(완료 / 전체 × 7). 일부만 끝났으면 1~6칸, 전부 끝나면 7칸.
export const planCells = (done: number, total: number): number => {
  if (total <= 0 || done <= 0) return 0
  if (done >= total) return 7
  return Math.min(6, Math.max(1, Math.round((done / total) * 7)))
}

export const barText = (filled: number, width: number): { on: string; off: string } => ({
  on: '▓'.repeat(filled),
  off: '░'.repeat(width - filled),
})

// claude-sonnet-5-5 → Sonnet 5.5. 해석할 수 없으면 원본 그대로.
export const formatModelName = (raw: string): string => {
  const m = /^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(raw)
  if (!m) return raw
  const [, family, major, minor] = m
  const name = `${family![0]!.toUpperCase()}${family!.slice(1)}`
  return `${name} ${major}${minor ? `.${minor}` : ''}`
}

// ── 사용량 한도 ──

export type Limit = { kind: string; percentUsed: number | null; resetsAt: string | null }

const PERIOD_HOURS: Record<string, number> = { five_hour: 5, seven_day: 168 }
const LIMIT_LABELS: Record<string, string> = { five_hour: STRINGS.limit5h, seven_day: STRINGS.limitWeekly }

const has = (table: Record<string, unknown>, key: string): boolean => Object.prototype.hasOwnProperty.call(table, key)

// 모르는 kind는 kind 문자열 그대로 보여준다.
export const limitLabel = (kind: string): string => (has(LIMIT_LABELS, kind) ? LIMIT_LABELS[kind]! : kind)

// 엔진이 준 값에서 숫자·문자열이 아닌 것은 null로 둔다(추정하지 않는다).
export const normalizeLimits = (
  raw: readonly { kind: string; percentUsed?: unknown; resetsAt?: unknown }[],
): Limit[] =>
  raw.map(r => ({
    kind: String(r.kind),
    percentUsed: typeof r.percentUsed === 'number' && Number.isFinite(r.percentUsed) ? r.percentUsed : null,
    resetsAt: typeof r.resetsAt === 'string' && r.resetsAt !== '' ? r.resetsAt : null,
  }))

const resetTime = (l: Limit): number => {
  const t = l.resetsAt === null ? Number.NaN : Date.parse(l.resetsAt)
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

// 리셋 주기가 짧은 순으로 정렬해 앞의 두 개를 쓴다. 모든 kind의 주기를 알면 주기로,
// 아니면 resetsAt이 빠른 순으로 정한다.
export const pickLimitCells = (limits: readonly Limit[]): Limit[] => {
  const isKnown = limits.every(l => has(PERIOD_HOURS, l.kind))
  const sorted = [...limits].sort((a, b) =>
    isKnown ? PERIOD_HOURS[a.kind]! - PERIOD_HOURS[b.kind]! : resetTime(a) - resetTime(b),
  )
  return sorted.slice(0, 2)
}

const p2 = (n: number): string => String(n).padStart(2, '0')

// 24시간 이내면 'HH:MM'과 남은 시간, 그 이후면 'M/D HH:MM'. 로컬 시간. 읽을 수 없으면 '-'.
export const fmtReset = (resetsAt: string | null, now: number): { text: string; remain: string | null } => {
  const t = resetsAt === null ? Number.NaN : Date.parse(resetsAt)
  if (Number.isNaN(t)) return { text: STRINGS.dash, remain: null }
  const d = new Date(t)
  const clock = `${p2(d.getHours())}:${p2(d.getMinutes())}`
  const ms = t - now
  if (ms < 24 * 60 * 60 * 1000) {
    const minutes = Math.max(0, Math.floor(ms / 60_000))
    const remain = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`
    return { text: clock, remain }
  }

  return { text: `${d.getMonth() + 1}/${d.getDate()} ${clock}`, remain: null }
}

export const rateColor = (percent: number | null): string | undefined =>
  percent === null
    ? undefined
    : percent >= THRESHOLDS.rate.danger
      ? COLORS.danger
      : percent >= THRESHOLDS.rate.warn
        ? COLORS.warn
        : COLORS.ok

const percentText = (percent: number | null): string => (percent === null ? STRINGS.dash : `${Math.round(percent)}%`)

// '라벨 사용률% ↻ 리셋 시각 (남은 시간)'. ↻ 뒤 공백은 폰트에 따라 기호가 숫자와 겹치는 것을 막는다. 없는 값은 '-'.
export const limitSegs = (limit: Limit, now: number, withReset: boolean): Seg[] => {
  const color = rateColor(limit.percentUsed)
  const segs: Seg[] = [
    { text: `${limitLabel(limit.kind)} ` },
    color ? { text: percentText(limit.percentUsed), color } : { text: percentText(limit.percentUsed), dim: true },
  ]
  if (withReset) {
    const reset = fmtReset(limit.resetsAt, now)
    segs.push({ text: ` ↻ ${reset.text}${reset.remain ? ` (${reset.remain})` : ''}`, dim: true })
  }

  return segs
}

// ── 노력 ──

export const asEffort = (value: unknown): Effort | null =>
  typeof value === 'string' && (EFFORTS as readonly string[]).includes(value) ? (value as Effort) : null

export type Stamped = { value: string; at: number }

// 고른 값과 고른 시각. via는 적용에 쓴 경로(config.set, command.run, turn.step) 또는 직접 입력(typed)이다.
export type EffortSelection = Stamped & { via: string }

export type EffortSources = {
  selection: EffortSelection | null
  // 마지막 메인 요청이 실제로 실은 effort와 기록 시각
  request: Stamped | null
}

export const EMPTY_EFFORT: EffortSources = { selection: null, request: null }

export type EffortSource = 'selection' | 'last request' | 'none'

export type EffortView = { value: Effort | null; source: EffortSource; mismatch: boolean }

// 선택 > 마지막 요청 > 없음. 허용 값이 아니면 버린다.
// ⚠는 선택한 시각 이후의 요청이 있고 그 요청의 값이 선택과 다를 때만 붙는다.
export const pickEffort = (s: EffortSources): EffortView => {
  const selection = s.selection && asEffort(s.selection.value) ? s.selection : null
  const request = s.request && asEffort(s.request.value) ? s.request : null

  if (selection) {
    const mismatch = request !== null && request.at > selection.at && request.value !== selection.value
    return { value: asEffort(selection.value), source: 'selection', mismatch }
  }
  if (request) return { value: asEffort(request.value), source: 'last request', mismatch: false }

  return { value: null, source: 'none', mismatch: false }
}

// $.store에 저장해 둔 선택값 { value, at }. 형식이 다르거나 허용되지 않은 값이면 null.
export const parseSavedEffort = (raw: unknown): Stamped | null => {
  if (typeof raw !== 'object' || raw === null) return null
  const saved = raw as { value?: unknown; at?: unknown }
  const value = asEffort(saved.value)

  return value && typeof saved.at === 'number' && Number.isFinite(saved.at) ? { value, at: saved.at } : null
}

const VIA_LABELS: Record<string, string> = {
  'config.set': 'config',
  'command.run': 'effort command',
  'turn.step': 'turn.step',
  typed: 'typed /effort',
}

export const effortViaLabel = (via: string): string => (has(VIA_LABELS, via) ? VIA_LABELS[via]! : via)

// '값 at M/D HH:MM:SS' (로컬 시간). 없으면 'none'.
export const fmtStamp = (s: Stamped | null): string => {
  if (!s) return 'none'
  const d = new Date(s.at)
  const when = Number.isNaN(d.getTime())
    ? String(s.at)
    : `${d.getMonth() + 1}/${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`

  return `${s.value} at ${when}`
}

// ── 1줄째 ──

export type HeadView = { model: string; effort: EffortView }

const headSegs = (head: HeadView): Seg[] => [
  { text: head.model || STRINGS.dash, bold: true },
  { text: ' · ' },
  ...(head.effort.mismatch ? [{ text: '⚠ ', color: COLORS.mismatch }] : []),
  head.effort.value
    ? { text: head.effort.value, color: COLORS.effort }
    : { text: STRINGS.dash, dim: true },
]

// 폭이 모자라면 Weekly의 리셋 → 5h의 리셋과 남은 시간 순으로 뺀다.
export const buildRow1 = (head: HeadView, limits: readonly Limit[], now: number, columns: number): Seg[] => {
  const picked = pickLimitCells(limits)
  const levels = picked.length === 2 ? [[true, true], [true, false], [false, false]] : [[true], [false]]
  const rows = levels.map(resets =>
    join([headSegs(head), ...picked.map((limit, i) => limitSegs(limit, now, resets[i]!))]),
  )

  return rows.find(row => segWidth(row) <= columns) ?? rows[rows.length - 1]!
}

// ── 2줄째 ──

export type UsageView = {
  tokens: number | null
  window: number | null
  percent: number | null
  delta: number | null
}

export type PlanSummary = { done: number; total: number; current: string | null }

type ContextOpts = { bar: boolean; delta: boolean }

const contextSegs = (usage: UsageView | null, opts: ContextOpts): Seg[] => {
  if (!usage || usage.tokens === null) return [{ text: `☁ ${STRINGS.noData}`, dim: true }]
  const weather = weatherOf(usage.tokens)
  const style = weather.color ? { color: weather.color } : {}
  const percent = usage.percent ?? (usage.window ? Math.round((usage.tokens / usage.window) * 100) : null)
  const segs: Seg[] = [
    { text: `${weather.icon} ${weather.word} `, ...style },
    { text: `${fmtTokens(usage.tokens)}${usage.window ? `/${fmtTokens(usage.window)}` : ''}` },
  ]
  if (opts.bar && percent !== null) {
    const bar = barText(contextCells(percent, usage.tokens), 10)
    segs.push({ text: ' ' }, { text: bar.on, ...style }, { text: bar.off, dim: true })
  }
  if (opts.delta && usage.delta !== null && usage.delta !== 0) {
    segs.push({ text: ` (${fmtDelta(usage.delta)})`, dim: true })
  }

  return segs
}

type PlanOpts = { bar: boolean; step: string | null }

const stepLabel = (plan: PlanSummary): string | null =>
  plan.total > 0 && plan.done >= plan.total ? STRINGS.allDone : plan.current ? `▶ ${plan.current}` : null

const planSegs = (plan: PlanSummary, opts: PlanOpts): Seg[] => {
  const segs: Seg[] = [{ text: `${STRINGS.plan} ${plan.done}/${plan.total}` }]
  if (opts.bar) {
    const bar = barText(planCells(plan.done, plan.total), 7)
    segs.push({ text: ' ' }, { text: bar.on, color: COLORS.planBar }, { text: bar.off, dim: true })
  }
  if (opts.step) segs.push({ text: ' ' }, { text: opts.step, bold: true })

  return segs
}

// 폭이 모자라면 현재 단계 이름(…) → 계획 막대 → 컨텍스트 막대 → 증감 순으로 줄인다.
export const buildRow2 = (usage: UsageView | null, plan: PlanSummary | null, columns: number): Seg[] => {
  const build = (o: { step: string | null; planBar: boolean; ctxBar: boolean; delta: boolean }): Seg[] =>
    join([
      contextSegs(usage, { bar: o.ctxBar, delta: o.delta }),
      ...(plan ? [planSegs(plan, { bar: o.planBar, step: o.step })] : []),
    ])

  const label = plan ? stepLabel(plan) : null
  let opts = { step: label, planBar: true, ctxBar: true, delta: true }
  let row = build(opts)
  if (segWidth(row) <= columns) return row

  if (label) {
    const room = columns - segWidth(build({ ...opts, step: null })) - 1
    opts = { ...opts, step: room >= 2 ? truncate(label, room) : null }
    row = build(opts)
    if (segWidth(row) <= columns) return row
    opts = { ...opts, step: null }
  }
  for (const drop of ['planBar', 'ctxBar', 'delta'] as const) {
    opts = { ...opts, [drop]: false }
    row = build(opts)
    if (segWidth(row) <= columns) return row
  }

  return row
}

// 높이가 3줄 미만일 때 1줄째와 2줄째를 합친 한 줄. 모델·노력, 날씨 단어, 토큰 수는 끝까지 남긴다.
export const buildMerged = (
  head: HeadView,
  usage: UsageView | null,
  plan: PlanSummary | null,
  limits: readonly Limit[],
  now: number,
  columns: number,
): Seg[] => {
  const first = pickLimitCells(limits)[0]
  const build = (o: { bar: boolean; delta: boolean; plan: boolean; limit: boolean }): Seg[] =>
    join([
      headSegs(head),
      contextSegs(usage, { bar: o.bar, delta: o.delta }),
      ...(plan && o.plan ? [[{ text: `${STRINGS.plan} ${plan.done}/${plan.total}` }]] : []),
      ...(first && o.limit ? [limitSegs(first, now, false)] : []),
    ])

  const steps = [
    { bar: true, delta: true, plan: true, limit: true },
    { bar: true, delta: false, plan: true, limit: true },
    { bar: false, delta: false, plan: true, limit: true },
    { bar: false, delta: false, plan: false, limit: true },
    { bar: false, delta: false, plan: false, limit: false },
  ]
  const rows = steps.map(build)

  return rows.find(row => segWidth(row) <= columns) ?? rows[rows.length - 1]!
}

// maxRows가 2 미만일 때의 한 줄.
export const buildMinimal = (head: HeadView, usage: UsageView | null): Seg[] =>
  join([headSegs(head), contextSegs(usage, { bar: false, delta: false })])

// ── 3줄째 배치 ──

export type Row3Layout = { labels: boolean; pickers: boolean; wrap: boolean }

const BUTTON_PAD = 4
const GAP = 1
const MIN_SPREAD = 2

// 모델·노력 버튼의 라벨. 콜론은 한 번만 찍고, 폭이 모자라면 접두어를 뺀다.
export const pickerLabel = (name: string, value: string, withPrefix: boolean): string =>
  `${withPrefix ? `${name}: ` : ''}${value} ▾`

// 폭이 모자라면 모델·노력 버튼의 접두어를 생략하고, 그래도 모자라면 버튼을 아래 행으로,
// 행이 없으면 모델·노력 버튼을 숨긴다.
export const layoutRow3 = (
  pickers: readonly { name: string; value: string }[],
  buttons: readonly string[],
  columns: number,
  maxRows: number,
): Row3Layout => {
  const right = buttons.reduce((sum, b) => sum + textWidth(b) + BUTTON_PAD, 0) + GAP * (buttons.length - 1)
  const left = (labels: boolean): number =>
    pickers.reduce((sum, p) => sum + textWidth(pickerLabel(p.name, p.value, labels)) + BUTTON_PAD, 0) +
    GAP * Math.max(0, pickers.length - 1)

  if (pickers.length === 0) return { labels: true, pickers: false, wrap: false }
  if (left(true) + MIN_SPREAD + right <= columns) return { labels: true, pickers: true, wrap: false }
  if (left(false) + MIN_SPREAD + right <= columns) return { labels: false, pickers: true, wrap: false }
  if (maxRows >= 4) return { labels: false, pickers: true, wrap: true }

  return { labels: false, pickers: false, wrap: false }
}

// ── 계획 ──

type Item = { id?: string; title: string; active: string; status: string }
type ToolUseLike = { tool: string; input: Record<string, unknown>; result?: unknown }
type MessageLike = { toolUses: readonly ToolUseLike[] }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

// TodoWrite는 목록 전체를 덮어쓰고, TaskCreate/TaskUpdate는 누적한다. 마지막으로 쓰인 쪽을 계획으로 본다.
export const reconstructPlan = (messages: readonly MessageLike[]): PlanSummary | null => {
  let todos: Item[] = []
  let tasks: Item[] = []
  let created = 0
  let last: 'todo' | 'task' | null = null

  for (const message of messages) {
    for (const use of message.toolUses) {
      if (use.tool === 'TodoWrite' && Array.isArray(use.input.todos)) {
        todos = (use.input.todos as Record<string, unknown>[]).map(t => ({
          title: str(t.content) || str(t.subject),
          active: str(t.activeForm),
          status: str(t.status),
        }))
        last = 'todo'
      } else if (use.tool === 'TaskCreate') {
        created += 1
        const fromResult = (use.result as { task?: { id?: unknown } } | undefined)?.task?.id
        tasks.push({
          id: typeof fromResult === 'string' ? fromResult : String(created),
          title: str(use.input.subject),
          active: str(use.input.activeForm),
          status: 'pending',
        })
        last = 'task'
      } else if (use.tool === 'TaskUpdate') {
        const id = str(use.input.taskId)
        const status = str(use.input.status)
        if (status === 'deleted') {
          tasks = tasks.filter(t => t.id !== id)
        } else {
          const task = tasks.find(t => t.id === id)
          if (task) {
            if (status) task.status = status
            if (typeof use.input.subject === 'string') task.title = use.input.subject
            if (typeof use.input.activeForm === 'string') task.active = use.input.activeForm
          }
        }
        last = 'task'
      }
    }
  }

  const items = last === 'todo' ? todos : last === 'task' ? tasks : []
  if (items.length === 0) return null

  const done = items.filter(i => i.status === 'completed').length
  const running = items.find(i => i.status === 'in_progress') ?? items.find(i => i.status !== 'completed')

  return { done, total: items.length, current: running ? running.active || running.title || null : null }
}

// ── 실행 경로 ──

export type Step = {
  name: string
  run: () => Promise<unknown>
  // 실행 뒤 효과가 있었는지. 없으면(false) 다음 경로로 넘어간다.
  verify?: () => Promise<boolean>
}

export type ChainResult = { path: string | null; errors: string[] }

// 위에서부터 시도해 처음 성공한 경로 이름을 돌려준다. 예외 또는 효과 없음이면 다음으로 넘어간다.
export const runChain = async (steps: readonly Step[]): Promise<ChainResult> => {
  const errors: string[] = []
  for (const step of steps) {
    try {
      await step.run()
      if (step.verify && !(await step.verify())) {
        errors.push(`${step.name}: no effect`)
        continue
      }
      return { path: step.name, errors }
    } catch (err) {
      errors.push(`${step.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { path: null, errors }
}
