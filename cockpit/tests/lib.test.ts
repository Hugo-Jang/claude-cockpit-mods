import { expect, test } from 'claude-code/testing'

import {
  EMPTY_EFFORT,
  STRINGS,
  asEffort,
  buildMerged,
  buildMinimal,
  buildRow1,
  buildRow2,
  contextCells,
  effortViaLabel,
  fmtDelta,
  fmtReset,
  fmtStamp,
  fmtTokens,
  formatModelName,
  layoutRow3,
  limitLabel,
  normalizeLimits,
  parseSavedEffort,
  pickEffort,
  pickerLabel,
  pickLimitCells,
  planCells,
  rateColor,
  reconstructPlan,
  runChain,
  segWidth,
  textWidth,
  weatherOf,
} from '../hooks/lib'
import type { HeadView, Limit, Seg } from '../hooks/lib'

const joined = (segs: readonly Seg[]): string => segs.map(s => s.text).join('')

const HEAD: HeadView = { model: 'Sonnet 5.5', effort: { value: 'medium', source: 'selection', mismatch: false } }
const NOW = Date.parse('2026-10-19T12:00:00')
const at = (ms: number): string => new Date(NOW + ms).toISOString()
const H = 3_600_000
const M = 60_000

test('토큰 표기', () => {
  expect(fmtTokens(0)).toBe('0')
  expect(fmtTokens(999)).toBe('999')
  expect(fmtTokens(1500)).toBe('1.5k')
  expect(fmtTokens(9_949)).toBe('9.9k')
  expect(fmtTokens(9_999)).toBe('10k')
  expect(fmtTokens(124_300)).toBe('124k')
  expect(fmtTokens(999_700)).toBe('1M')
  expect(fmtTokens(1_000_000)).toBe('1M')
  expect(fmtTokens(1_500_000)).toBe('1.5M')
  expect(fmtDelta(8_000)).toBe('+8k')
  expect(fmtDelta(8_100)).toBe('+8.1k')
  expect(fmtDelta(-30_000)).toBe('-30k')
})

test('날씨 구간과 색', () => {
  expect(weatherOf(99_999)).toEqual({ icon: '☀', word: 'Sunny' })
  expect(weatherOf(100_000)).toEqual({ icon: '☁', word: 'Cloudy' })
  expect(weatherOf(199_999).word).toBe('Cloudy')
  expect(weatherOf(200_000)).toEqual({ icon: '☂', word: 'Rain', color: 'yellow' })
  expect(weatherOf(399_999).word).toBe('Rain')
  expect(weatherOf(400_000)).toEqual({ icon: '⛈', word: 'Storm', color: 'red' })
})

test('막대 칸 수', () => {
  expect(contextCells(12, 124_000)).toBe(1)
  expect(contextCells(0, 500)).toBe(1)
  expect(contextCells(0, 0)).toBe(0)
  expect(contextCells(99, 1)).toBe(9)
  expect(contextCells(100, 1)).toBe(10)
  expect(planCells(0, 7)).toBe(0)
  expect(planCells(1, 100)).toBe(1)
  expect(planCells(99, 100)).toBe(6)
  expect(planCells(3, 7)).toBe(3)
  expect(planCells(7, 7)).toBe(7)
})

test('날씨 아이콘은 폭 2칸', () => {
  expect(textWidth('☁ ')).toBe(3)
  expect(textWidth('⛈')).toBe(2)
  expect(textWidth('abc')).toBe(3)
})

test('모델명 변환', () => {
  expect(formatModelName('claude-sonnet-5-5')).toBe('Sonnet 5.5')
  expect(formatModelName('claude-opus-4-1-20250805')).toBe('Opus 4.1')
  expect(formatModelName('claude-fable-5')).toBe('Fable 5')
  expect(formatModelName('sonnet')).toBe('sonnet')
  expect(formatModelName('Sonnet 5.5')).toBe('Sonnet 5.5')
})

test('남은 시간과 24시간 기준 표기', () => {
  expect(fmtReset(at(2 * H + 13 * M), NOW).remain).toBe('2h 13m')
  expect(fmtReset(at(41 * M), NOW).remain).toBe('41m')
  expect(fmtReset(at(59 * M + 59_000), NOW).remain).toBe('59m')
  expect(fmtReset(at(2 * H), NOW).text).toBe('14:00')
  const far = fmtReset(at(4 * 24 * H), NOW)
  expect(far.text).toBe('10/23 12:00')
  expect(far.remain).toBeNull()
  expect(fmtReset(null, NOW)).toEqual({ text: '-', remain: null })
  expect(fmtReset('garbage', NOW)).toEqual({ text: '-', remain: null })
})

test('한도 정렬과 라벨', () => {
  const week: Limit = { kind: 'seven_day', percentUsed: 12, resetsAt: at(4 * 24 * H) }
  const five: Limit = { kind: 'five_hour', percentUsed: 34, resetsAt: at(2 * H) }
  const spend: Limit = { kind: 'spend_limit', percentUsed: 5, resetsAt: at(10 * 24 * H) }
  expect(pickLimitCells([week, five]).map(l => l.kind)).toEqual(['five_hour', 'seven_day'])
  expect(pickLimitCells([spend, week, five]).map(l => l.kind)).toEqual(['five_hour', 'seven_day'])
  expect(pickLimitCells([five, week, { ...spend, resetsAt: at(1 * H) }]).map(l => l.kind)).toEqual([
    'spend_limit',
    'five_hour',
  ])
  expect(limitLabel('five_hour')).toBe('5h')
  expect(limitLabel('seven_day')).toBe('Weekly')
  expect(limitLabel('spend_limit')).toBe('spend_limit')
})

test('사용률 색 경계', () => {
  expect(rateColor(69.9)).toBe('green')
  expect(rateColor(70)).toBe('yellow')
  expect(rateColor(89)).toBe('yellow')
  expect(rateColor(90)).toBe('red')
  expect(rateColor(null)).toBeUndefined()
})

test('1줄째: 두 칸, 반올림, 없는 값은 -', () => {
  const limits = normalizeLimits([
    { kind: 'seven_day', percentUsed: 12.4, resetsAt: at(4 * 24 * H) },
    { kind: 'five_hour', percentUsed: 33.6, resetsAt: at(2 * H + 13 * M) },
  ])
  const row = buildRow1(HEAD, limits, NOW, 200)
  expect(joined(row)).toBe('Sonnet 5.5 · medium │ 5h 34% ↻ 14:13 (2h 13m) │ Weekly 12% ↻ 10/23 12:00')
  const pct = row.find(s => s.text === '34%')
  expect(pct?.color).toBe('green')

  const partial = normalizeLimits([{ kind: 'five_hour', percentUsed: undefined, resetsAt: undefined }])
  expect(joined(buildRow1(HEAD, partial, NOW, 200))).toBe('Sonnet 5.5 · medium │ 5h - ↻ -')
  expect(buildRow1(HEAD, partial, NOW, 200).find(s => s.text === '-' && s.dim)).toBeDefined()
})

test('1줄째: 한도가 비면 사용량 칸과 구분선이 없다', () => {
  expect(joined(buildRow1(HEAD, [], NOW, 200))).toBe('Sonnet 5.5 · medium')
})

test('1줄째: 폭이 모자라면 Weekly 리셋, 5h 리셋 순으로 뺀다', () => {
  const limits = normalizeLimits([
    { kind: 'five_hour', percentUsed: 34, resetsAt: at(2 * H + 13 * M) },
    { kind: 'seven_day', percentUsed: 12, resetsAt: at(4 * 24 * H) },
  ])
  const full = joined(buildRow1(HEAD, limits, NOW, 200))
  const noWeeklyReset = joined(buildRow1(HEAD, limits, NOW, full.length - 1))
  expect(noWeeklyReset).toBe('Sonnet 5.5 · medium │ 5h 34% ↻ 14:13 (2h 13m) │ Weekly 12%')
  const noResets = joined(buildRow1(HEAD, limits, NOW, noWeeklyReset.length - 1))
  expect(noResets).toBe('Sonnet 5.5 · medium │ 5h 34% │ Weekly 12%')
  expect(joined(buildRow1(HEAD, limits, NOW, 5))).toBe(noResets)
})

test('1줄째: 노력 불일치는 값 앞에 ⚠가 붙고, 값이 없으면 -이다', () => {
  const warn: HeadView = { ...HEAD, effort: { value: 'high', source: 'selection', mismatch: true } }
  const row = buildRow1(warn, [], NOW, 200)
  expect(joined(row)).toBe('Sonnet 5.5 · ⚠ high')
  expect(row.find(s => s.text === '⚠ ')?.color).toBe('yellow')
  const none: HeadView = { model: '', effort: { value: null, source: 'none', mismatch: false } }
  expect(joined(buildRow1(none, [], NOW, 200))).toBe('- · -')
})

test('2줄째: 평상시, 경고, 위험', () => {
  const plan = { done: 3, total: 7, current: 'Write tests' }
  expect(joined(buildRow2({ tokens: 124_000, window: 1_000_000, percent: 12, delta: 8_000 }, plan, 200))).toBe(
    '☁ Cloudy 124k/1M ▓░░░░░░░░░ (+8k) │ Plan 3/7 ▓▓▓░░░░ ▶ Write tests',
  )
  const rain = buildRow2({ tokens: 312_000, window: 1_000_000, percent: 31, delta: 21_000 }, { ...plan, done: 5 }, 200)
  expect(joined(rain)).toBe('☂ Rain 312k/1M ▓▓▓░░░░░░░ (+21k) │ Plan 5/7 ▓▓▓▓▓░░ ▶ Write tests')
  expect(rain[0]?.color).toBe('yellow')
  const storm = buildRow2({ tokens: 460_000, window: 1_000_000, percent: 46, delta: -34_000 }, plan, 200)
  expect(joined(storm).startsWith('⛈ Storm 460k/1M ▓▓▓▓░░░░░░ (-34k)')).toBe(true)
  expect(storm[0]?.color).toBe('red')
})

test('2줄째: No data, 계획 숨김, All done, 증감 생략', () => {
  expect(joined(buildRow2(null, null, 200))).toBe('☁ No data')
  expect(joined(buildRow2({ tokens: null, window: 1_000_000, percent: null, delta: null }, null, 200))).toBe('☁ No data')
  expect(joined(buildRow2({ tokens: 124_000, window: 1_000_000, percent: 12, delta: null }, null, 200))).toBe(
    '☁ Cloudy 124k/1M ▓░░░░░░░░░',
  )
  expect(
    joined(buildRow2({ tokens: 124_000, window: 1_000_000, percent: 12, delta: 0 }, { done: 7, total: 7, current: null }, 200)),
  ).toBe('☁ Cloudy 124k/1M ▓░░░░░░░░░ │ Plan 7/7 ▓▓▓▓▓▓▓ ✔ All done')
})

test('2줄째: 폭이 모자라면 단계 이름 → 계획 막대 → 컨텍스트 막대 → 증감 순으로 줄인다', () => {
  const usage = { tokens: 124_000, window: 1_000_000, percent: 12, delta: 8_000 }
  const plan = { done: 3, total: 7, current: 'Write tests for the whole thing' }
  const full = '☁ Cloudy 124k/1M ▓░░░░░░░░░ (+8k) │ Plan 3/7 ▓▓▓░░░░ ▶ '
  const fullWidth = textWidth(full)

  const cut = buildRow2(usage, plan, fullWidth + 8)
  expect(joined(cut).endsWith('▶ Write t…')).toBe(true)
  expect(segWidth(cut)).toBeLessThanOrEqual(fullWidth + 8)

  const noStep = joined(buildRow2(usage, plan, fullWidth - 1))
  expect(noStep).toBe('☁ Cloudy 124k/1M ▓░░░░░░░░░ (+8k) │ Plan 3/7 ▓▓▓▓░░░'.replace('▓▓▓▓░░░', '▓▓▓░░░░'))

  const noPlanBar = joined(buildRow2(usage, plan, textWidth(noStep) - 1))
  expect(noPlanBar).toBe('☁ Cloudy 124k/1M ▓░░░░░░░░░ (+8k) │ Plan 3/7')
  const noCtxBar = joined(buildRow2(usage, plan, textWidth(noPlanBar) - 1))
  expect(noCtxBar).toBe('☁ Cloudy 124k/1M (+8k) │ Plan 3/7')
  const noDelta = joined(buildRow2(usage, plan, textWidth(noCtxBar) - 1))
  expect(noDelta).toBe('☁ Cloudy 124k/1M │ Plan 3/7')
  expect(joined(buildRow2(usage, plan, 3))).toBe('☁ Cloudy 124k/1M │ Plan 3/7')
})

test('낮은 높이: 합친 한 줄과 최소 한 줄', () => {
  const usage = { tokens: 124_000, window: 1_000_000, percent: 12, delta: 8_000 }
  const plan = { done: 3, total: 7, current: 'x' }
  const limits = normalizeLimits([{ kind: 'five_hour', percentUsed: 34, resetsAt: at(2 * H) }])
  expect(joined(buildMerged(HEAD, usage, plan, limits, NOW, 200))).toBe(
    'Sonnet 5.5 · medium │ ☁ Cloudy 124k/1M ▓░░░░░░░░░ (+8k) │ Plan 3/7 │ 5h 34%',
  )
  const narrow = joined(buildMerged(HEAD, usage, plan, limits, NOW, 1))
  expect(narrow).toBe('Sonnet 5.5 · medium │ ☁ Cloudy 124k/1M')
  expect(joined(buildMinimal(HEAD, usage))).toBe('Sonnet 5.5 · medium │ ☁ Cloudy 124k/1M')
})

test('3줄째 배치: 접두어 생략, 아래 행, 모델·노력 버튼 숨김', () => {
  const pickers = [
    { name: 'Model', value: 'sonnet' },
    { name: 'Effort', value: 'medium' },
  ]
  const buttons = ['Resume', 'Rewind', 'Compact', 'Clear']
  expect(layoutRow3(pickers, buttons, 120, 10)).toEqual({ labels: true, pickers: true, wrap: false })
  expect(layoutRow3(pickers, buttons, 80, 10)).toEqual({ labels: false, pickers: true, wrap: false })
  expect(layoutRow3(pickers, buttons, 50, 10)).toEqual({ labels: false, pickers: true, wrap: true })
  expect(layoutRow3(pickers, buttons, 50, 3)).toEqual({ labels: false, pickers: false, wrap: false })
})

test('모델·노력 버튼 라벨은 콜론이 한 번만 나온다', () => {
  expect(pickerLabel('Model', 'sonnet', true)).toBe('Model: sonnet ▾')
  expect(pickerLabel('Effort', 'medium', false)).toBe('medium ▾')
  expect(pickerLabel('Model', 'sonnet', true).match(/:/g)).toHaveLength(1)
})

test('계획 계산', () => {
  const todo = (todos: object[]) => [{ toolUses: [{ tool: 'TodoWrite', input: { todos } }] }]
  expect(reconstructPlan([])).toBeNull()
  expect(
    reconstructPlan(
      todo([
        { content: 'a', status: 'completed' },
        { content: 'b', activeForm: 'Doing b', status: 'in_progress' },
        { content: 'c', status: 'pending' },
      ]),
    ),
  ).toEqual({ done: 1, total: 3, current: 'Doing b' })
  expect(
    reconstructPlan(
      todo([
        { content: 'a', status: 'completed' },
        { content: 'c', status: 'pending' },
      ]),
    )?.current,
  ).toBe('c')
  expect(reconstructPlan(todo([{ content: 'a', status: 'completed' }]))).toEqual({ done: 1, total: 1, current: null })

  const tasks = [
    {
      toolUses: [
        { tool: 'TaskCreate', input: { subject: 'one' }, result: { task: { id: '1' } } },
        { tool: 'TaskCreate', input: { subject: 'two' }, result: { task: { id: '2' } } },
        { tool: 'TaskCreate', input: { subject: 'three' }, result: { task: { id: '3' } } },
        { tool: 'TaskUpdate', input: { taskId: '1', status: 'completed' } },
        { tool: 'TaskUpdate', input: { taskId: '2', status: 'in_progress', activeForm: 'Working two' } },
        { tool: 'TaskUpdate', input: { taskId: '3', status: 'deleted' } },
      ],
    },
  ]
  expect(reconstructPlan(tasks)).toEqual({ done: 1, total: 2, current: 'Working two' })
})

const SELECTION = { value: 'high', at: 10, via: 'command.run' }

test('노력 출처: 선택 > 마지막 요청 > -', () => {
  // (e) 선택이 없으면 마지막 요청 값, 그것도 없으면 -
  expect(pickEffort(EMPTY_EFFORT)).toEqual({ value: null, source: 'none', mismatch: false })
  expect(pickEffort({ ...EMPTY_EFFORT, request: { value: 'medium', at: 5 } })).toEqual({
    value: 'medium',
    source: 'last request',
    mismatch: false,
  })
  expect(pickEffort({ selection: SELECTION, request: { value: 'low', at: 5 } }).value).toBe('high')
  expect(pickEffort({ selection: SELECTION, request: null }).source).toBe('selection')
})

test('⚠: 선택 시각 이후의 요청이 선택값과 다를 때만 붙는다', () => {
  // (a) 선택 직후 요청 전에는 없다. 선택 이전의 요청도 무시한다.
  expect(pickEffort({ selection: SELECTION, request: null }).mismatch).toBe(false)
  expect(pickEffort({ selection: SELECTION, request: { value: 'low', at: 9 } }).mismatch).toBe(false)
  expect(pickEffort({ selection: SELECTION, request: { value: 'low', at: 10 } }).mismatch).toBe(false)
  // (b) 선택 뒤 같은 값의 요청이면 없다.
  expect(pickEffort({ selection: SELECTION, request: { value: 'high', at: 11 } }).mismatch).toBe(false)
  // (c) 선택 뒤 다른 값의 요청이면 있다. 표시는 선택값 그대로다.
  expect(pickEffort({ selection: SELECTION, request: { value: 'low', at: 11 } })).toEqual({
    value: 'high',
    source: 'selection',
    mismatch: true,
  })
  // 마지막 요청이 같은 값으로 돌아오면 다시 지워진다.
  expect(pickEffort({ selection: SELECTION, request: { value: 'high', at: 12 } }).mismatch).toBe(false)
  // 선택이 없으면 ⚠도 없다.
  expect(pickEffort({ ...EMPTY_EFFORT, request: { value: 'low', at: 11 } }).mismatch).toBe(false)
})

test('허용되지 않은 노력 값은 채택하지 않는다', () => {
  expect(asEffort('turbo')).toBeNull()
  expect(asEffort(3)).toBeNull()
  expect(asEffort(undefined)).toBeNull()
  expect(asEffort('xhigh')).toBe('xhigh')
  expect(pickEffort({ ...EMPTY_EFFORT, request: { value: 'ultra', at: 1 } }).source).toBe('none')
  expect(pickEffort({ selection: { value: 'turbo', at: 1, via: 'typed' }, request: { value: 'low', at: 2 } })).toEqual({
    value: 'low',
    source: 'last request',
    mismatch: false,
  })
})

test('저장된 선택값: { value, at } 형식이고 허용된 값일 때만 되살린다', () => {
  expect(parseSavedEffort({ value: 'max', at: 7 })).toEqual({ value: 'max', at: 7 })
  expect(parseSavedEffort({ value: 'max' })).toBeNull()
  expect(parseSavedEffort({ value: 'turbo', at: 7 })).toBeNull()
  expect(parseSavedEffort('high')).toBeNull()
  expect(parseSavedEffort(undefined)).toBeNull()
})

test('/cockpit-status 노력 표기: 경로 이름과 시각 문구', () => {
  expect(effortViaLabel('config.set')).toBe('config')
  expect(effortViaLabel('command.run')).toBe('effort command')
  expect(effortViaLabel('turn.step')).toBe('turn.step')
  expect(effortViaLabel('typed')).toBe('typed /effort')
  expect(fmtStamp(null)).toBe('none')
  expect(fmtStamp({ value: 'high', at: NOW })).toBe('high at 10/19 12:00:00')
})

test('실행 경로: 예외나 효과 없음이면 다음 경로로 넘어간다', async () => {
  const calls: string[] = []
  const result = await runChain([
    {
      name: 'one',
      run: async () => {
        calls.push('one')
        throw new Error('boom')
      },
    },
    {
      name: 'two',
      run: async () => {
        calls.push('two')
      },
      verify: async () => false,
    },
    {
      name: 'three',
      run: async () => {
        calls.push('three')
      },
      verify: async () => true,
    },
    {
      name: 'four',
      run: async () => {
        calls.push('four')
      },
    },
  ])
  expect(result.path).toBe('three')
  expect(calls).toEqual(['one', 'two', 'three'])
  expect(result.errors).toEqual(['one: boom', 'two: no effect'])
  expect((await runChain([{ name: 'x', run: async () => Promise.reject(new Error('no')) }])).path).toBeNull()
})

test('화면 문구에는 영어 외 문자가 없다', () => {
  // 기호(▓ ░ ↻ │ ⚠ ✔ ▶ ☁ …)는 허용하고 한글, 일본어, 중국어만 막는다.
  const nonEnglish = /[ᄀ-ᇿ぀-ヿ㐀-鿿가-힣]/
  for (const value of Object.values(STRINGS)) expect(nonEnglish.test(value)).toBe(false)
})
