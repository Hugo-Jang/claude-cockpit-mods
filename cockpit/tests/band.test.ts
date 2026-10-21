import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const NOW = Date.parse('2026-10-19T12:00:00')
const H = 3_600_000

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 110,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
} as const

type World = {
  tokens?: number
  limits?: { kind: string; percentUsed: number; resetsAt?: string }[]
  messages?: { role: 'user' | 'assistant'; text: string; toolUses: never[] }[]
  model?: string
  // true면 config 목록에 effort 행을 둔다
  effortRow?: boolean
}

// 엔진 아래쪽을 가짜로 채우고, 호출 기록을 돌려준다.
const world = (on: On, w: World = {}, store: Record<string, unknown> = {}) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, store)
  const log = {
    commands: [] as string[],
    fills: [] as string[],
    toasts: [] as string[],
    sets: [] as string[],
    // turn.step 맨 아래까지 내려간 요청의 effort
    sent: [] as unknown[],
    compacts: 0,
  }
  const row = { value: w.model ?? 'sonnet', effort: 'medium' }
  const failures = { command: false, effort: false }

  on('classic.SessionStart', () => ({}) as never)
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: {
        window: 1_000_000,
        ...(w.tokens !== undefined ? { tokens: w.tokens, percent: Math.floor(w.tokens / 10_000) } : {}),
      },
      rateLimits: w.limits ?? [],
    },
  }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.messages', () => ({ value: w.messages ?? [] }) as never)
  on('turn.step', async function* (_$, e) {
    log.sent.push(e.effort)
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  on('config.list', () => ({
    value: [
      {
        key: 'model',
        label: 'Model',
        kind: 'choice',
        value: row.value,
        options: ['default', 'sonnet', 'opus', 'haiku', 'fable', 'best', 'sonnet[1m]', 'opus[1m]', 'opusplan'],
        provider: 'core',
        isLocked: false,
      },
      ...(w.effortRow
        ? [
            {
              key: 'effort',
              label: 'Effort',
              kind: 'choice',
              value: row.effort,
              options: ['low', 'medium', 'high', 'xhigh', 'max'],
              provider: 'core',
              isLocked: false,
            },
          ]
        : []),
    ],
  }) as never)
  on('config.set', (_$, e) => {
    log.sets.push(`${e.key}=${String(e.value)}`)
    if (e.key === 'effort') row.effort = String(e.value)
    else row.value = String(e.value)
    return { value: e.value }
  })
  on('command.run', (_$, e) => {
    log.commands.push(e.args ? `${e.command} ${e.args}` : e.command)
    if (failures.command || (e.command === 'effort' && failures.effort)) throw new Error('refused')
    return { text: e.command === 'effort' ? `Set effort level to ${e.args}` : '' }
  })
  on('session.compact', () => {
    log.compacts += 1
    return { skip: 'test' } as never
  })
  on('prompt.fill', (_$, e) => {
    log.fills.push(e.text)
    return { isFilled: true, text: e.text, cursor: e.text.length } as never
  })
  on('ui.toast', (_$, e) => {
    log.toasts.push(e.text)
    return { value: undefined } as never
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }) as never)
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))

  return { clock, log, row, failures }
}

const mount = ($: Engine, props: Record<string, unknown> = {}) =>
  $.ui.mount({ plugin: 'cockpit-mods', surface: 'terminal', component: 'AbovePrompt', props: { ...PROPS, ...props } as never })

const texts = async (ui: Awaited<ReturnType<typeof mount>>, type: string) => (await ui.findAll({ type })).map(f => f.text)

test('밴드: 1줄째 선택 버튼과 사용량 두 칸, 2줄째 날씨와 동작 버튼', async ($, on) => {
  world(on, {
    tokens: 124_000,
    limits: [
      { kind: 'seven_day', percentUsed: 12, resetsAt: new Date(NOW + 4 * 24 * H).toISOString() },
      { kind: 'five_hour', percentUsed: 34, resetsAt: new Date(NOW + 2 * H).toISOString() },
    ],
  })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  const all = (await texts(ui, 'Text')).join('')
  expect(all).toContain('5h 34% ↻ 14:00 (2h 0m)')
  expect(all).toContain('Weekly 12% ↻ 10/23 12:00')
  expect(all).toContain('☁ Cloudy 124k/1M ▓░░░░░░░░░')
  expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['model-menu', 'effort-menu', 'resume', 'rewind', 'compact', 'clear'])
  expect((await ui.findAll({ type: 'Button' })).slice(2).map(b => b.text)).toEqual(['Resume', 'Rewind', 'Compact', 'Clear'])
  expect((await ui.find({ type: 'Button', key: 'model-menu' }))?.text).toBe('Model: Sonnet 5.5 ▾')
  expect(await ui.find({ type: 'Button', key: 'effort-menu' })).toBeDefined()
  for (const b of await ui.findAll({ type: 'Button' })) expect(b.props.hotkey).toBeUndefined()
})

test('컨텍스트를 못 읽으면 No data, 한도가 없으면 사용량 칸이 없다', async ($, on) => {
  world(on)
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  const all = (await texts(ui, 'Text')).join('')
  expect(all).toContain('☁ No data')
  expect(all).not.toContain('Plan')
  expect(all).not.toContain('5h')
})

test('계획은 messages의 toolUses에서 만든다', async ($, on) => {
  world(on, {
    tokens: 50_000,
    messages: [
      {
        role: 'assistant',
        text: '',
        toolUses: [
          {
            tool: 'TodoWrite',
            input: {
              todos: [
                { content: 'a', status: 'completed' },
                { content: 'b', activeForm: 'Doing b', status: 'in_progress' },
              ],
            },
          },
        ] as never,
      },
    ],
  })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  const all = (await texts(ui, 'Text')).join('')
  expect(all).toContain('Plan 1/2 ▓▓▓▓░░░ ▶ Doing b')
})

test('확인: No는 실행 없이 되돌리고, 확인 중에는 버튼은 그대로 두고 줄만 하나 더해진다', async ($, on) => {
  const { log } = world(on, { tokens: 124_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  const before = (await texts(ui, 'Text')).slice(0, -1)

  await ui.press({ key: 'clear' })
  expect(await ui.find({ type: 'Text', text: '⚠ This clears the whole conversation. Run it?' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'clear' })).toBeDefined()
  const yes = await ui.find({ type: 'Button', key: 'confirm-yes' })
  const no = await ui.find({ type: 'Button', key: 'confirm-no' })
  expect(yes?.text).toBe('Yes')
  expect(no?.text).toBe('No')
  expect(no?.props.autoFocus).toBe(true)
  expect((await texts(ui, 'Text')).slice(0, before.length)).toEqual(before)

  await ui.press({ key: 'confirm-no' })
  expect(await ui.find({ key: 'confirm-no' })).toBeUndefined()
  expect(log.commands).toEqual([])
})

test('확인 문구는 동작마다 다르다', async ($, on) => {
  world(on, { tokens: 1_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  const expected = {
    resume: 'This opens the session picker. Run it?',
    rewind: 'This opens the rewind menu. Run it?',
    compact: 'This summarizes the conversation to free context. Run it?',
    clear: 'This clears the whole conversation. Run it?',
  } as const
  for (const [key, message] of Object.entries(expected)) {
    await ui.press({ key })
    expect(await ui.find({ type: 'Text', text: `⚠ ${message}` })).toBeDefined()
    await ui.press({ key: 'confirm-no' })
  }
})

test('확인: 10초가 지나면 취소된다', async ($, on) => {
  const { clock, log } = world(on, { tokens: 1_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  await ui.press({ key: 'compact' })
  expect(await ui.find({ key: 'confirm-yes' })).toBeDefined()
  await clock.advance(10_001)
  expect(await ui.find({ key: 'confirm-yes' })).toBeUndefined()
  expect(await ui.find({ key: 'compact' })).toBeDefined()
  expect(log.compacts).toBe(0)
})

test('확인: 새 턴이 시작되면 취소된다', async ($, on) => {
  world(on, { tokens: 1_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  await ui.press({ key: 'clear' })
  expect(await ui.find({ key: 'confirm-yes' })).toBeDefined()
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await ui.redraw()
  expect(await ui.find({ key: 'confirm-yes' })).toBeUndefined()
})

test('확인: 세션이 resume으로 끝나면 확인 상태가 초기화된다', async ($, on) => {
  world(on, { tokens: 1_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  await ui.press({ key: 'resume' })
  expect(await ui.find({ key: 'confirm-yes' })).toBeDefined()
  await $.session.end({ reason: 'resume', sessionId: 's1', resume: { id: 's1' } } as never)
  await ui.redraw()
  expect(await ui.find({ key: 'confirm-yes' })).toBeUndefined()
  expect((await texts(ui, 'Text')).join('')).toContain('☁ No data')
})

test('Resume: 경로 1이 실패하면 입력창 채우기로 넘어가고 안내 토스트가 뜬다', async ($, on) => {
  const { log, failures } = world(on, { tokens: 1_000 })
  failures.command = true
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  await ui.press({ key: 'resume' })
  await ui.press({ key: 'confirm-yes' })
  expect(log.commands).toContain('resume')
  expect(log.fills).toEqual(['/resume'])
  expect(log.toasts).toContain('Press Enter to run it.')
})

test('Resume: 경로 1이 성공하면 입력창은 건드리지 않는다', async ($, on) => {
  const { log } = world(on, { tokens: 1_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  await ui.press({ key: 'resume' })
  await ui.press({ key: 'confirm-yes' })
  expect(log.commands).toEqual(['resume'])
  expect(log.fills).toEqual([])
})

test('Compact: 효과가 없으면 다음 경로로 넘어가 마지막에 입력창을 채운다', async ($, on) => {
  const { clock, log } = world(on, { tokens: 100_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  await ui.press({ key: 'compact' })
  const run = ui.press({ key: 'confirm-yes' })
  await clock.advance(5_000)
  await run
  expect(log.compacts).toBe(1)
  expect(log.commands).toContain('compact')
  expect(log.fills).toEqual(['/compact'])
  expect(log.toasts).toContain('Press Enter to run it.')
})

test('작업 중에는 버튼이 흐리게 보이고 눌러도 실행하지 않는다', async ($, on) => {
  const { log } = world(on, { tokens: 1_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($, { isWorking: true })
  for (const b of await ui.findAll({ type: 'Button' })) expect(b.props.dimColor).toBe(true)
  await ui.press({ key: 'clear' })
  expect(await ui.find({ key: 'confirm-yes' })).toBeUndefined()
  expect(log.toasts).toContain('Claude is working. Try again when it finishes.')
  expect(log.commands).toEqual([])
})

const joinedText = async (ui: Awaited<ReturnType<typeof mount>>) => (await texts(ui, 'Text')).join('')

const effortText = async (ui: Awaited<ReturnType<typeof mount>>) => (await ui.find({ key: 'effort-menu' }))?.text

test('모델·노력은 Select가 아니라 Button이고 라벨의 콜론은 한 번만 나온다', async ($, on) => {
  world(on, { tokens: 1_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  expect(await ui.find({ type: 'Select' })).toBeUndefined()
  expect((await ui.find({ type: 'Button', key: 'model-menu' }))?.text).toBe('Model: Sonnet 5.5 ▾')
  expect((await ui.find({ type: 'Button', key: 'effort-menu' }))?.text).toBe('Effort: - ▾')
  expect(await ui.find({ type: 'Button', text: /::/ })).toBeUndefined()
})

// 노력 선택지를 누르고 적용이 끝날 때까지 기다린다.
const chooseEffort = async (ui: Awaited<ReturnType<typeof mount>>, value: string) => {
  await ui.press({ key: 'effort-menu' })
  await ui.press({ key: `effort-opt-${value}` })
}

// 모델 요청 하나(turn.step)를 흘려보낸다. agentId를 주면 서브에이전트의 요청이다.
const requestStep = async ($: Engine, effort: string, agentId?: string) => {
  const stream = $.turn.step({
    turnId: 't1',
    index: 0,
    model: 'claude-sonnet-5-5',
    effort,
    messageCount: 1,
    ...(agentId ? { agentId } : {}),
  } as never)
  for await (const chunk of stream) void chunk
}

test('노력 버튼: 누르면 아래에 선택지 행이 더해지고, 고르면 적용하고 닫는다', async ($, on) => {
  world(on, { tokens: 1_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  const before = (await texts(ui, 'Text')).slice(0, 5)

  await ui.press({ key: 'effort-menu' })
  expect(await ui.find({ type: 'Text', text: 'Effort ▸' })).toBeDefined()
  expect((await ui.findAll({ type: 'Button' })).slice(6).map(b => b.text)).toEqual([
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
    'Close',
  ])
  expect(await ui.find({ key: 'compact' })).toBeDefined()
  expect((await texts(ui, 'Text')).slice(0, 5)).toEqual(before)

  await ui.press({ key: 'effort-opt-high' })
  expect(await ui.find({ key: 'effort-opt-high' })).toBeUndefined()
  expect(await effortText(ui)).toBe('Effort: high ▾')
  expect(await effortText(ui)).not.toContain('⚠')

  await ui.press({ key: 'effort-menu' })
  expect((await ui.find({ key: 'effort-opt-high' }))?.text).toBe('high ✔')
  expect((await ui.find({ key: 'effort-opt-low' }))?.text).toBe('low')
  await ui.press({ key: 'menu-close' })
  expect(await ui.find({ key: 'menu-close' })).toBeUndefined()
  expect(await effortText(ui)).toBe('Effort: high ▾')
})

test('선택지 행: 10초, 새 턴, resume으로 끝날 때 아무것도 바꾸지 않고 닫힌다', async ($, on) => {
  const { clock, log } = world(on, { tokens: 1_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)

  await ui.press({ key: 'effort-menu' })
  await clock.advance(10_001)
  expect(await ui.find({ key: 'menu-close' })).toBeUndefined()

  await ui.press({ key: 'model-menu' })
  expect(await ui.find({ key: 'menu-close' })).toBeDefined()
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await ui.redraw()
  expect(await ui.find({ key: 'menu-close' })).toBeUndefined()

  await ui.press({ key: 'effort-menu' })
  await $.session.end({ reason: 'resume', sessionId: 's1', resume: { id: 's1' } } as never)
  await ui.redraw()
  expect(await ui.find({ key: 'menu-close' })).toBeUndefined()
  expect(await effortText(ui)).toBe('Effort: - ▾')
  expect(log.sets).toEqual([])
})

test('노력 적용 경로 2: 설정 행이 없으면 내장 /effort를 값과 함께 실행하고 바로 토스트로 끝낸다', async ($, on) => {
  const { log } = world(on, { tokens: 1_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  await chooseEffort(ui, 'high')
  expect(log.commands).toEqual(['effort high'])
  expect(log.sets).toEqual([])
  expect(log.toasts).toEqual(['Effort set to high.'])
  expect(await effortText(ui)).toBe('Effort: high ▾')
  expect(await joinedText(ui)).not.toContain('⚠')
  const out = await $.command.run({ command: 'cockpit-status' } as never)
  expect(out.text).toContain('Effort: command.run')
  // 버튼이 부른 /effort는 직접 입력으로 세지 않는다.
  expect(out.text).toContain('applied via=effort command')
})

test('노력 적용 경로 1: config에 effort 행이 있으면 config.set으로 바꾸고 바로 토스트로 끝낸다', async ($, on) => {
  const { log } = world(on, { tokens: 1_000, effortRow: true })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  await chooseEffort(ui, 'xhigh')
  expect(log.sets).toEqual(['effort=xhigh'])
  expect(log.commands).toEqual([])
  expect(log.toasts).toEqual(['Effort set to xhigh.'])
  const out = await $.command.run({ command: 'cockpit-status' } as never)
  expect(out.text).toContain('Effort: config.set')
  expect(out.text).toContain('applied via=config')
})

test('노력 적용 경로 3: 앞의 경로가 모두 실패하면 다음 요청부터 덮어쓰고 토스트로 알린다', async ($, on) => {
  const { clock, log, failures } = world(on, { tokens: 1_000 })
  failures.effort = true
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  await chooseEffort(ui, 'high')
  expect(log.toasts).toEqual(['Applies from the next request.'])
  expect(await effortText(ui)).toBe('Effort: high ▾')
  expect(await joinedText(ui)).not.toContain('⚠')
  const out = await $.command.run({ command: 'cockpit-status' } as never)
  expect(out.text).toContain('Effort: turn.step')
  expect(out.text).toContain('applied via=turn.step')

  // 엔진의 값이 medium이어도 덮어쓰므로 실제로 나간 값은 high이고 ⚠는 없다.
  await clock.advance(1_000)
  await requestStep($, 'medium')
  await ui.redraw()
  expect(log.sent).toEqual(['high'])
  expect(await effortText(ui)).toBe('Effort: high ▾')
  expect(await joinedText(ui)).not.toContain('⚠')
})

test('노력: 저장된 선택값은 시각과 함께 /clear 뒤 세션 시작에서 복원된다', async ($, on) => {
  world(on, { tokens: 1_000 }, { effort: { value: 'max', at: NOW - 1_000 } })
  await $.classic.SessionStart({ source: 'clear' } as never)
  const ui = await mount($)
  expect(await effortText(ui)).toBe('Effort: max ▾')
  const out = await $.command.run({ command: 'cockpit-status' } as never)
  expect(out.text).toContain('selection=max at 10/19 11:59:59')
})

test('노력: 시작 직후에는 -이고 선택이 없으면 마지막 메인 요청의 값을 보여 준다', async ($, on) => {
  world(on, { tokens: 1_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  expect(await effortText(ui)).toBe('Effort: - ▾')

  await requestStep($, 'medium')
  await ui.redraw()
  expect(await effortText(ui)).toBe('Effort: medium ▾')
  expect(await joinedText(ui)).not.toContain('⚠')
  const out = await $.command.run({ command: 'cockpit-status' } as never)
  expect(out.text).toContain('effort: shown=medium source=last request')
  expect(out.text).toContain('selection=none')
})

test('⚠: 선택 직후 요청 전에는 없고, 같은 값의 요청이면 없고, 다른 값의 요청이면 붙었다가 같은 값이 오면 지워진다', async ($, on) => {
  const { clock, log } = world(on, { tokens: 1_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  await chooseEffort(ui, 'high')
  expect(await effortText(ui)).toBe('Effort: high ▾')
  expect(await joinedText(ui)).not.toContain('⚠')

  await clock.advance(1_000)
  await requestStep($, 'high')
  await ui.redraw()
  expect(await effortText(ui)).toBe('Effort: high ▾')
  expect(await joinedText(ui)).not.toContain('⚠')

  await clock.advance(1_000)
  await requestStep($, 'low')
  await ui.redraw()
  expect(await effortText(ui)).toBe('Effort: ⚠ high ▾')
  // 이 경로(config가 아닌 /effort 실행)는 덮어쓰지 않으므로 엔진의 값이 그대로 나간다.
  expect(log.sent).toEqual(['high', 'low'])

  await clock.advance(1_000)
  await requestStep($, 'high')
  await ui.redraw()
  expect(await effortText(ui)).toBe('Effort: high ▾')
  expect(await joinedText(ui)).not.toContain('⚠')
})

test('⚠: 선택 이전의 요청은 무시하고, 새로 고르면 ⚠가 사라진다', async ($, on) => {
  const { clock } = world(on, { tokens: 1_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  await requestStep($, 'low')
  await clock.advance(1_000)
  await chooseEffort(ui, 'high')
  expect(await effortText(ui)).toBe('Effort: high ▾')
  expect(await joinedText(ui)).not.toContain('⚠')

  await clock.advance(1_000)
  await requestStep($, 'low')
  await ui.redraw()
  expect(await effortText(ui)).toBe('Effort: ⚠ high ▾')

  await clock.advance(1_000)
  await chooseEffort(ui, 'low')
  expect(await effortText(ui)).toBe('Effort: low ▾')
  expect(await joinedText(ui)).not.toContain('⚠')
})

test('서브에이전트(agentId 있음) 요청은 기록하지도 덮어쓰지도 않는다', async ($, on) => {
  const { clock, log, failures } = world(on, { tokens: 1_000 })
  failures.effort = true
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  await requestStep($, 'low', 'agent-1')
  await ui.redraw()
  expect(await effortText(ui)).toBe('Effort: - ▾')

  await chooseEffort(ui, 'high')
  await clock.advance(1_000)
  await requestStep($, 'low', 'agent-1')
  await ui.redraw()
  expect(log.sent).toEqual(['low', 'low'])
  expect(await joinedText(ui)).not.toContain('⚠')
  const out = await $.command.run({ command: 'cockpit-status' } as never)
  expect(out.text).toContain('last request=none')
})

test('내장 /effort를 직접 입력하면 그 값이 새 선택값이 되고 ⚠는 붙지 않는다', async ($, on) => {
  const { clock, log } = world(on, { tokens: 1_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  await chooseEffort(ui, 'high')
  await clock.advance(1_000)
  await requestStep($, 'high')

  await clock.advance(1_000)
  await $.command.run({ command: 'effort', args: 'low' } as never)
  await ui.redraw()
  expect(await effortText(ui)).toBe('Effort: low ▾')
  expect(await joinedText(ui)).not.toContain('⚠')
  const out = await $.command.run({ command: 'cockpit-status' } as never)
  expect(out.text).toContain('effort: shown=low source=selection')
  expect(out.text).toContain('applied via=typed /effort')

  // 이후 엔진이 다른 값으로 요청하면 그때부터 ⚠가 붙는다.
  await clock.advance(1_000)
  await requestStep($, 'high')
  await ui.redraw()
  expect(await effortText(ui)).toBe('Effort: ⚠ low ▾')
  expect(log.commands).toEqual(['effort high', 'effort low'])
})

test('내장 /effort에 허용되지 않은 인자를 넣으면 선택값은 그대로다', async ($, on) => {
  world(on, { tokens: 1_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  await chooseEffort(ui, 'high')
  await $.command.run({ command: 'effort', args: 'turbo' } as never)
  await ui.redraw()
  expect(await effortText(ui)).toBe('Effort: high ▾')
})

test('모델 버튼: 선택지는 config 행의 options에서 읽고, 현재 값에 ✔가 붙는다', async ($, on) => {
  const { log } = world(on, { tokens: 10_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  await ui.press({ key: 'model-menu' })
  expect(await ui.find({ type: 'Text', text: 'Model ▸' })).toBeDefined()
  expect((await ui.findAll({ type: 'Button' })).slice(6).map(b => b.text)).toEqual(['haiku', 'sonnet ✔', 'opus', 'Close'])
  await ui.press({ key: 'model-opt-haiku' })
  expect(log.sets).toEqual(['model=haiku'])
  expect(await ui.find({ key: 'confirm-yes' })).toBeUndefined()
  expect(await ui.find({ key: 'menu-close' })).toBeUndefined()
})

test('모델 버튼: 현재 값이 세 별칭에 없어도 버튼에는 실제 모델명이 보이고 선택지에는 넣지 않으며, 별칭을 그대로 설정한다', async ($, on) => {
  const { log } = world(on, { tokens: 10_000, model: 'default' })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  expect((await ui.find({ key: 'model-menu' }))?.text).toBe('Model: Sonnet 5.5 ▾')
  await ui.press({ key: 'model-menu' })
  expect((await ui.findAll({ type: 'Button' })).slice(6).map(b => b.text)).toEqual(['haiku', 'sonnet', 'opus', 'Close'])
  await ui.press({ key: 'model-opt-sonnet' })
  expect(log.sets).toEqual(['model=sonnet'])
})

test('테두리: 높이가 5 이상이면 둥근 상자로 감싸고 내용 폭은 bodyColumns - 4다', async ($, on) => {
  world(on, { tokens: 124_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  const outer = (await ui.findAll({ type: 'Box' })).find(b => b.props.borderStyle === 'round')
  expect(outer?.props.borderStyle).toBe('round')
  expect(outer?.props.borderColor).toBe('cyan')
  expect(outer?.props.paddingX).toBe(1)
  expect((await ui.findAll({ type: 'Box' })).some(b => b.props.width === PROPS.bodyColumns - 4)).toBe(true)
})

test('테두리: 높이가 작아도 항상 테두리 상자로 그린다', async ($, on) => {
  world(on, { tokens: 124_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($, { maxRows: 4 })
  expect((await ui.findAll({ type: 'Box' })).some(b => b.props.borderStyle === 'round')).toBe(true)
  expect((await ui.findAll({ type: 'Button' })).length).toBe(6)
  expect((await texts(ui, 'Text')).join('')).toContain('☁ Cloudy')
})

test('테두리 안에서도 확인 줄은 3줄째 자리에서 바뀐다', async ($, on) => {
  world(on, { tokens: 1_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  await ui.press({ key: 'clear' })
  expect(await ui.find({ key: 'confirm-yes' })).toBeDefined()
  expect((await ui.findAll({ type: 'Box' })).some(b => b.props.borderStyle === 'round')).toBe(true)
})

test('모델 버튼: 컨텍스트가 200k 이상이면 확인을 거친다', async ($, on) => {
  const { log } = world(on, { tokens: 250_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)

  await ui.press({ key: 'model-menu' })
  await ui.press({ key: 'model-opt-opus' })
  expect(
    await ui.find({
      type: 'Text',
      text: '⚠ Switch model to opus? The cache is rebuilt, so the next turn may use more.',
    }),
  ).toBeDefined()
  expect(log.sets).toEqual([])
  await ui.press({ key: 'confirm-no' })
  expect(log.sets).toEqual([])

  await ui.press({ key: 'model-menu' })
  await ui.press({ key: 'model-opt-opus' })
  await ui.press({ key: 'confirm-yes' })
  expect(log.sets).toEqual(['model=opus'])
})

test('작업 중에는 모델·노력 버튼도 흐리게 보이고 눌러도 열리지 않는다', async ($, on) => {
  const { log } = world(on, { tokens: 1_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($, { isWorking: true })
  expect((await ui.find({ key: 'model-menu' }))?.props.dimColor).toBe(true)
  expect((await ui.find({ key: 'effort-menu' }))?.props.dimColor).toBe(true)
  await ui.press({ key: 'effort-menu' })
  expect(await ui.find({ key: 'menu-close' })).toBeUndefined()
  expect(log.toasts).toContain('Claude is working. Try again when it finishes.')
})

test('폭과 높이: 좁으면 접두어를 줄이고, 높이와 상관없이 같은 모양이다', async ($, on) => {
  world(on, { tokens: 124_000 })
  await $.classic.SessionStart({ source: 'startup' } as never)

  const wide = await mount($)
  expect((await wide.find({ key: 'model-menu' }))?.text).toBe('Model: Sonnet 5.5 ▾')

  const narrow = await $.ui.mount({
    plugin: 'cockpit-mods',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...PROPS, bodyColumns: 40 } as never,
    requestId: 'narrow',
  })
  expect((await narrow.find({ key: 'model-menu' }))?.text).toBe('Sonnet 5.5 ▾')
  expect((await narrow.findAll({ type: 'Button' })).slice(2).map(b => b.text)).toEqual(['Resume', 'Rewind', 'Compact', 'Clear'])

  for (const maxRows of [4, 2, 1]) {
    const short = await $.ui.mount({
      plugin: 'cockpit-mods',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { ...PROPS, maxRows } as never,
      requestId: `short${maxRows}`,
    })
    expect((await short.findAll({ type: 'Button' })).length).toBe(6)
    expect((await short.findAll({ type: 'Box' })).some(x => x.props.borderStyle === 'round')).toBe(true)
    expect((await texts(short, 'Text')).join('')).toContain('☁ Cloudy 124k/1M')
  }
})

test('설문이 떠 있으면 아무것도 그리지 않는다', async ($, on) => {
  world(on, { tokens: 1_000 })
  const ui = await mount($, { hasSurvey: true })
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
})

test('/cockpit-status는 원본 값과 노력 출처, 동작별 경로를 보여 준다', async ($, on) => {
  const { log } = world(on, {
    tokens: 100_000,
    limits: [{ kind: 'five_hour', percentUsed: 34, resetsAt: new Date(NOW + 2 * H).toISOString() }],
  })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await mount($)
  await ui.press({ key: 'resume' })
  await ui.press({ key: 'confirm-yes' })
  expect(log.commands).toEqual(['resume'])

  const out = await $.command.run({ command: 'cockpit-status' } as never)
  expect(out.text).toContain('context: tokens=100000 window=1000000')
  expect(out.text).toContain('kind=five_hour percentUsed=34')
  expect(out.text).toContain('model: config=sonnet session=claude-sonnet-5-5')
  expect(out.text).toContain('effort: shown=- source=none')
  expect(out.text).toContain('Resume: command.run')
  expect(out.text).toContain('Clear: none')
})
