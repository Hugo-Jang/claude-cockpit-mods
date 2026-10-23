import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Usage } from '../types'
import {
  ACTION_STRINGS,
  COLORS,
  EFFORTS,
  EMPTY_EFFORT,
  MIN_SPREAD,
  STRINGS,
  THRESHOLDS,
  asEffort,
  buildRow2,
  buttonsWidth,
  effortViaLabel,
  fmtStamp,
  formatModelName,
  layoutRow1,
  normalizeLimits,
  parseSavedEffort,
  pickModels,
  pickEffort,
  pickerLabel,
  planFromInput,
  reconstructPlan,
  runChain,
  text,
} from './lib'
import type { Seg, Step } from './lib'

const usageAtom = atom({ plugin: 'cockpit-mods', key: 'usage' } as const, null)
const planAtom = atom({ plugin: 'cockpit-mods', key: 'plan' } as const, null)
const modelAtom = atom({ plugin: 'cockpit-mods', key: 'model' } as const, null)
const modelNameAtom = atom({ plugin: 'cockpit-mods', key: 'modelName' } as const, '')
const limitsAtom = atom({ plugin: 'cockpit-mods', key: 'limits' } as const, [])
const tickAtom = atom({ plugin: 'cockpit-mods', key: 'tick' } as const, 0)
const confirmAtom = atom({ plugin: 'cockpit-mods', key: 'confirm' } as const, null)
const effortAtom = atom({ plugin: 'cockpit-mods', key: 'effort' } as const, EMPTY_EFFORT)
const menuAtom = atom({ plugin: 'cockpit-mods', key: 'menu' } as const, null)

type Action = 'resume' | 'rewind' | 'compact' | 'clear'
const ACTIONS: readonly Action[] = ['resume', 'rewind', 'compact', 'clear']

type Snapshot = { len: number; tokens: number | null }

// 10초 취소 타이머와 1분 카운트다운 타이머. 모듈이 다시 로드되면 호스트가 함께 버린다.
let confirmTimer: { cancel: () => void } | null = null
let menuTimer: { cancel: () => void } | null = null
let ticker: { cancel: () => void } | null = null
let isRunning = false
// 버튼으로 노력을 적용하는 동안은 내장 /effort 호출을 직접 입력으로 보지 않는다.
let isApplyingEffort = false

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

// ── 데이터 ──

// usage()의 컨텍스트와 한도를 상태에 반영한다. 토큰이 같으면 직전 증감을 그대로 둔다.
const applyUsage = async (
  $: EngineInterface,
  context: { tokens?: number; window?: number; percent?: number },
  rateLimits: Parameters<typeof normalizeLimits>[0],
): Promise<Usage> => {
  const next: Usage = {
    tokens: context.tokens ?? null,
    window: context.window ?? null,
    percent: context.percent ?? null,
    delta: null,
  }
  await update($, usageAtom, prev => {
    if (next.tokens === null || !prev || prev.tokens === null) return next
    return { ...next, delta: next.tokens === prev.tokens ? prev.delta : next.tokens - prev.tokens }
  })
  await update($, limitsAtom, () => normalizeLimits(rateLimits))

  return next
}

// 못 읽으면 컨텍스트는 null(No data), 한도는 빈 목록(칸을 숨긴다).
const refreshUsage = async ($: EngineInterface): Promise<Usage | null> => {
  try {
    const { context, rateLimits } = await $.session.usage()
    return await applyUsage($, context, rateLimits)
  } catch {
    await update($, usageAtom, () => null)
    await update($, limitsAtom, () => [])
    return null
  }
}

const refreshPlan = async ($: EngineInterface) => {
  let next: ReturnType<typeof reconstructPlan> = null
  try {
    next = reconstructPlan(await $.session.messages())
  } catch {
    next = null
  }
  await update($, planAtom, () => next)
}

const readModel = async ($: EngineInterface) => {
  let choice: { value: string; options: string[] } | null = null
  let name = ''
  try {
    const row = (await $.config.list()).find(r => r.key === 'model')
    if (row) choice = { value: String(row.value), options: pickModels(row.options ?? []) }
  } catch {
    choice = null
  }
  try {
    name = await $.session.model()
  } catch {
    name = ''
  }
  await update($, modelAtom, () => choice)
  await update($, modelNameAtom, () => name)
}

const refresh = async ($: EngineInterface) => {
  await refreshUsage($)
  await refreshPlan($)
  await readModel($)
}

// 저장해 둔 선택값을 되살린다. 저장은 turn.step으로 덮어쓰는 경로만 하므로 via도 그것이다.
const restoreSelection = async ($: EngineInterface) => {
  try {
    const saved = parseSavedEffort(await $.store.get('effort'))
    await update($, effortAtom, s => ({ ...s, selection: saved ? { ...saved, via: 'turn.step' } : null }))
  } catch {
    // 저장소를 못 읽으면 복원하지 않는다.
  }
}

// ── 선택 ──

// 성공한 경로 이름을 동작별로 $.store의 paths에 기록한다.
const recordPath = async ($: EngineInterface, key: string, path: string) => {
  const saved = await $.store.get('paths')
  const map = typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>) : {}
  await $.store.set('paths', { ...map, [key]: { path, at: await $.clock.now() } })
}

const effortRows = async ($: EngineInterface) => (await $.config.list()).filter(r => /effort/i.test(r.key))

// 고른 노력 값을 바로 적용한다. 설정 행 → 내장 /effort → 다음 요청부터 덮어쓰기 순으로 시도한다.
const applyEffort = async ($: EngineInterface, value: string) => {
  await closeMenu($)
  const effort = asEffort(value)
  if (!effort) return
  const at = await $.clock.now()

  isApplyingEffort = true
  const result = await runChain([
    {
      name: 'config.set',
      run: async () => {
        const row = (await effortRows($))[0]
        if (!row) throw new Error('no effort row')
        const r = await $.config.set({ key: row.key, value: effort })
        if (r.deny !== undefined) throw new Error(r.deny)
      },
      verify: async () => (await effortRows($))[0]?.value === effort,
    },
    {
      name: 'command.run',
      run: async () => {
        const r = await $.command.run({ command: 'effort', args: effort })
        if (r.text !== undefined && !r.text.toLowerCase().includes(effort)) throw new Error(r.text)
      },
    },
    {
      name: 'turn.step',
      run: () => $.store.set('effort', { value: effort, at }),
    },
  ]).finally(() => {
    isApplyingEffort = false
  })
  if (result.path === null) return
  await recordPath($, 'effort', result.path)
  const via = result.path
  await update($, effortAtom, s => ({ ...s, selection: { value: effort, at, via } }))

  if (result.path === 'turn.step') {
    $.ui.toast(text('effortNextRequest'))
    return
  }
  await $.store.delete('effort')
  $.ui.toast(text('effortSet', { X: effort }))
}

const isModelSet = async ($: EngineInterface, value: string): Promise<boolean> =>
  (await $.config.list()).find(r => r.key === 'model')?.value === value

const applyModel = async ($: EngineInterface, value: string) => {
  let isSet = false
  try {
    const r = await $.config.set({ key: 'model', value })
    isSet = r.deny === undefined && (await isModelSet($, value))
  } catch {
    isSet = false
  }
  await readModel($)
  if (!isSet) {
    $.ui.toast(text('modelFailed'))
    return
  }
  const usage = await refreshUsage($)
  if (usage && usage.tokens !== null && usage.window !== null && usage.tokens > usage.window) {
    $.ui.toast(text('modelTooBig'))
  }
}

// ── 선택지 행 ──

const closeMenu = async ($: EngineInterface) => {
  menuTimer?.cancel()
  menuTimer = null
  await update($, menuAtom, () => null)
}

// 선택지 행을 펼친다. 한 번에 하나만 열리고, 10초 동안 입력이 없으면 닫힌다.
const openMenu = async ($: EngineInterface, name: 'model' | 'effort') => {
  try {
    if (name === 'model') await readModel($)
    menuTimer?.cancel()
    await update($, menuAtom, () => name)
    menuTimer = $.clock.after(THRESHOLDS.confirmMs, () => {
      void update($, menuAtom, () => null).catch(() => undefined)
    })
  } catch {
    await closeMenu($)
  }
}

// ── 확인 ──

const cancelConfirm = async ($: EngineInterface) => {
  confirmTimer?.cancel()
  confirmTimer = null
  await update($, confirmAtom, () => null)
}

// 확인을 띄운다. 어느 단계든 오류가 나면 실행하지 않고 취소한다.
const startConfirm = async ($: EngineInterface, kind: 'resume' | 'rewind' | 'compact' | 'clear' | 'model', value = '') => {
  try {
    await closeMenu($)
    const token = await $.clock.now()
    confirmTimer?.cancel()
    await update($, confirmAtom, () => ({ kind, value, token }))
    confirmTimer = $.clock.after(THRESHOLDS.confirmMs, () => {
      void update($, confirmAtom, c => (c && c.token === token ? null : c)).catch(() => undefined)
    })
  } catch {
    await cancelConfirm($)
  }
}

// 지금 대기 중인 확인을 꺼내고 비운다. 그리는 시점의 값이 아니라 현재 값을 쓴다.
const takeConfirm = async ($: EngineInterface) => {
  const { value } = await $.state.get({ plugin: 'cockpit-mods', key: 'confirm' } as const)
  await cancelConfirm($)
  return value ?? null
}

const requestModel = async ($: EngineInterface, value: string) => {
  await closeMenu($)
  const { value: usage } = await $.state.get({ plugin: 'cockpit-mods', key: 'usage' } as const)
  if (usage && usage.tokens !== null && usage.tokens >= THRESHOLDS.modelConfirmTokens) {
    await startConfirm($, 'model', value)
    return
  }
  await applyModel($, value)
}

// ── 동작 실행 ──

const snapshot = async ($: EngineInterface): Promise<Snapshot> => {
  const messages = await $.session.messages()
  let tokens: number | null = null
  try {
    tokens = (await $.session.usage()).context.tokens ?? null
  } catch {
    tokens = null
  }
  return { len: messages.length, tokens }
}

// 실행 뒤 메시지 수나 토큰이 줄었으면 효과가 있었다고 본다.
const hasEffect = async ($: EngineInterface, before: Snapshot): Promise<boolean> => {
  await $.clock.sleep(THRESHOLDS.settleMs)
  const after = await snapshot($)
  return after.len < before.len || (before.tokens !== null && after.tokens !== null && after.tokens < before.tokens)
}

const fillStep = ($: EngineInterface, command: string): Step => ({
  name: 'prompt.fill',
  run: async () => {
    const r = await $.prompt.fill({ text: `/${command}` })
    if (!r.isFilled) throw new Error('prompt not filled')
  },
})

const runStep = ($: EngineInterface, command: string, before?: Snapshot): Step => ({
  name: 'command.run',
  run: () => $.command.run({ command }),
  ...(before ? { verify: () => hasEffect($, before) } : {}),
})

// 동작별 실행 경로. 위에서부터 시도한다.
const stepsFor = ($: EngineInterface, action: Action, before: Snapshot): Step[] => {
  if (action === 'compact') {
    return [
      {
        name: 'session.compact',
        run: async () => {
          const r = await $.session.compact({})
          if (r.skip !== undefined) throw new Error(`skip: ${r.skip}`)
        },
        verify: () => hasEffect($, before),
      },
      runStep($, 'compact', before),
      fillStep($, 'compact'),
    ]
  }
  if (action === 'clear') return [runStep($, 'clear', before), fillStep($, 'clear')]

  return [runStep($, action), fillStep($, action)]
}

const runAction = async ($: EngineInterface, action: Action) => {
  if (isRunning) return
  isRunning = true
  try {
    const before = await snapshot($)
    const result = await runChain(stepsFor($, action, before))
    if (result.path === null) {
      $.ui.toast(text('actionFailed', { Action: ACTION_STRINGS[action], action }))
      return
    }
    await recordPath($, action, result.path)
    if (result.path === 'prompt.fill') $.ui.toast(text('pressEnter'))
  } finally {
    isRunning = false
    await refresh($)
  }
}

// 예를 눌렀을 때만 실제로 실행한다.
const confirmYes = async ($: EngineInterface) => {
  try {
    const confirm = await takeConfirm($)
    if (!confirm) return
    if (confirm.kind === 'model') await applyModel($, confirm.value)
    else await runAction($, confirm.kind)
  } catch (err) {
    $.ui.toast(errorText(err))
  }
}

const confirmText = (kind: Action | 'model', value: string): string =>
  kind === 'model'
    ? text('confirmModel', { X: value })
    : text(
        kind === 'resume'
          ? 'confirmResume'
          : kind === 'rewind'
            ? 'confirmRewind'
            : kind === 'compact'
              ? 'confirmCompact'
              : 'confirmClear',
      )

// ── /cockpit-status ──

const statusText = async ($: EngineInterface): Promise<string> => {
  const lines: string[] = []

  try {
    const { context, rateLimits, cost } = await $.session.usage()
    lines.push(
      `context: tokens=${String(context.tokens)} window=${context.window} percent=${String(context.percent)} cost=${cost ? JSON.stringify(cost) : 'none'}`,
      `rateLimits: ${rateLimits.length}`,
    )
    for (const r of rateLimits) {
      lines.push(`  kind=${r.kind} percentUsed=${String(r.percentUsed)} resetsAt=${String(r.resetsAt)}`)
    }
  } catch (err) {
    lines.push(`usage failed: ${errorText(err)}`)
  }

  try {
    const row = (await $.config.list()).find(r => r.key === 'model')
    lines.push(`model: config=${row ? String(row.value) : 'none'} session=${await $.session.model()}`)
  } catch (err) {
    lines.push(`model failed: ${errorText(err)}`)
  }

  const { value: sources } = await $.state.get({ plugin: 'cockpit-mods', key: 'effort' } as const)
  const effort = sources ?? EMPTY_EFFORT
  const view = pickEffort(effort)
  lines.push(
    `effort: shown=${view.value ?? '-'} source=${view.source}`,
    `  selection=${fmtStamp(effort.selection)}`,
    `  last request=${fmtStamp(effort.request)}`,
    `  applied via=${effort.selection ? effortViaLabel(effort.selection.via) : 'none'}`,
  )

  const { value: plan } = await $.state.get({ plugin: 'cockpit-mods', key: 'plan' } as const)
  lines.push(`plan: ${plan ? `${plan.done}/${plan.total}` : 'none'}`)

  const saved = await $.store.get('paths')
  const map = typeof saved === 'object' && saved !== null ? (saved as Record<string, { path?: string }>) : {}
  for (const action of ACTIONS) lines.push(`${ACTION_STRINGS[action]}: ${map[action]?.path ?? 'none'}`)
  lines.push(`${STRINGS.effort}: ${map.effort?.path ?? 'none'}`)

  return lines.join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await restoreSelection($)
    await refresh($)
    await $.tool.register({
      name: 'progress',
      description:
        '진행 막대 표시. 사용자가 "단계별"·"하나씩"·"진행률"을 말하거나 3단계 이상 작업이면 작업 전에 progress(0,총단계)를 먼저 호출하고, 단계가 끝날 때마다 progress(완료수,총단계)를 호출한다. 생략 금지.',
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: { done: { type: 'integer' }, total: { type: 'integer' } },
        required: ['done', 'total'],
      },
    })
    ticker?.cancel()
    ticker = $.clock.every(60_000, () => {
      void update($, tickAtom, n => n + 1).catch(() => undefined)
    })
    try {
      await $.command.register({ name: 'cockpit-status', description: STRINGS.statusDescription })
    } catch {
      // 이름이 겹치면 등록만 건너뛴다.
    }

    return next(e)
  })

  // 다른 이벤트가 건너뛰어져도 값이 바로 남도록, 도구 호출에서 계획을 직접 저장한다.
  on('tool.call', { tool: 'mcp__cockpit-mods__progress' }, async ($, e, next) => {
    const plan = planFromInput(e as unknown as Record<string, unknown>)
    await update($, planAtom, () => plan)

    return { result: plan ? `${plan.done}/${plan.total}` : 'invalid' }
  })

  on('session.measure', async ($, e, next) => {
    await applyUsage($, e.context, e.rateLimits)

    return next(e)
  })

  on('command.run', { command: 'cockpit-status' }, async $ => ({ text: await statusText($) }))

  // 직접 입력한 내장 /effort가 끝나면 그 인자를 새 선택값으로 삼는다(⚠ 없음). 표시 출처가 아니라 선택값 갱신용이다.
  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const result = await next(e)
    if (isApplyingEffort) return result
    try {
      const value = asEffort(e.args.trim().toLowerCase())
      if (value) {
        const at = await $.clock.now()
        await update($, effortAtom, s => ({ ...s, selection: { value, at, via: 'typed' } }))
        await $.store.delete('effort')
      }
    } catch {
      // 기록하지 못해도 명령은 그대로 실행된다.
    }

    return result
  })

  // /clear와 /resume 뒤에는 session.start가 오지 않으므로 여기서 다시 읽는다.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear' || e.source === 'resume' || e.source === 'fork') await restoreSelection($)
    await refresh($)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      await cancelConfirm($)
      await closeMenu($)
      await update($, usageAtom, () => null)
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await cancelConfirm($)
      await closeMenu($)
    }

    return next(e)
  })

  // 메인 요청이 실제로 싣는 effort와 시각을 기록한다. turn.step 경로로 고른 값이 있으면 그 값으로 덮어쓰고,
  // 덮어쓴 값을 기록한다. 서브에이전트 요청은 건드리지 않고, 오류가 나면 덮어쓰지 않는다.
  on('turn.step', async function* ($, e, next) {
    let step = e
    if (e.agentId === undefined) {
      try {
        const seen = asEffort(e.effort)
        if (seen) {
          const { value: sources } = await $.state.get({ plugin: 'cockpit-mods', key: 'effort' } as const)
          const picked = sources?.selection?.via === 'turn.step' ? asEffort(sources.selection.value) : null
          if (picked) step = { ...e, effort: picked }
          const sent = picked ?? seen
          const at = await $.clock.now()
          await update($, effortAtom, s => ({ ...s, request: { value: sent, at } }))
        }
      } catch {
        step = e
      }
    }

    return yield* next(step)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) await refresh($)

    return result
  })

  // 밴드에서 포커스가 빠지면(Esc) 확인과 선택지 행을 닫는다.
  on('ui.focus', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.element === undefined) {
      await cancelConfirm($)
      await closeMenu($)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const usage = await read($, usageAtom)
    const plan = await read($, planAtom)
    const model = await read($, modelAtom)
    const modelName = await read($, modelNameAtom)
    const limits = await read($, limitsAtom)
    const effort = await read($, effortAtom)
    const confirm = await read($, confirmAtom)
    const menu = await read($, menuAtom)
    await read($, tickAtom)
    const { Box, Button, Text } = $.ui.resolve(e)
    const rest = await next(e)

    const now = await $.clock.now()
    // 항상 테두리 상자로 감싼다. 내용 폭은 좌우 테두리와 패딩을 뺀 bodyColumns - 4다.
    const columns = e.props.bodyColumns - 4
    const isLocked = e.props.isWorking
    const head = { model: modelName ? formatModelName(modelName) : '', effort: pickEffort(effort) }

    const segs = (list: Seg[]) =>
      list.map((s, i) => (
        <Text
          key={`seg${i}`}
          {...(s.color ? { color: s.color } : {})}
          {...(s.dim ? { dimColor: true } : {})}
          {...(s.bold ? { weight: 'bold' as const } : {})}
        >
          {s.text}
        </Text>
      ))

    const tellWorking = () => $.ui.toast(text('working'))
    const run = (task: () => Promise<void>) => {
      if (isLocked) tellWorking()
      else void task().catch(err => $.ui.toast(errorText(err)))
    }

    const effortValue = `${head.effort.mismatch ? '⚠ ' : ''}${head.effort.value ?? STRINGS.dash}`
    const pickerInfo = [
      ...(model ? [{ name: STRINGS.model, value: head.model || model.value }] : []),
      { name: STRINGS.effort, value: effortValue },
    ]
    const buttonLabels = ACTIONS.map(a => ACTION_STRINGS[a])
    const layout = layoutRow1(pickerInfo, limits, now, columns)

    const pickers = (
      <Box gap={1}>
        {pickerInfo.map(p => {
          const name = p.name === STRINGS.model ? 'model' : 'effort'
          return (
            <Button
              key={`${name}-menu`}
              label={pickerLabel(p.name, p.value, layout.labels)}
              {...(isLocked ? { dimColor: true } : {})}
              onPress={() => run(() => openMenu($, name))}
            />
          )
        })}
      </Box>
    )

    // 펼친 선택지 행: 현재 값에는 ✔를 붙이고, 누르면 적용하고 닫는다.
    const menuOptions = menu === 'model' ? (model ? model.options : []) : [...EFFORTS]
    const menuCurrent = menu === 'model' ? model?.value : head.effort.value
    const menuRow = menu ? (
      <Box width={columns} flexWrap="wrap" gap={1}>
        <Text>{menu === 'model' ? STRINGS.menuModel : STRINGS.menuEffort}</Text>
        {menuOptions.map(value => (
          <Button
            key={`${menu}-opt-${value}`}
            label={value === menuCurrent ? `${value} ✔` : value}
            onPress={() =>
              run(async () => {
                if (value === menuCurrent) await closeMenu($)
                else if (menu === 'model') await requestModel($, value)
                else await applyEffort($, value)
              })
            }
          />
        ))}
        <Button key="menu-close" label={STRINGS.close} onPress={() => void closeMenu($)} />
      </Box>
    ) : null

    const buttons = (
      <Box gap={1}>
        {ACTIONS.map(action => (
          <Button
            key={action}
            label={ACTION_STRINGS[action]}
            {...(isLocked ? { dimColor: true } : {})}
            onPress={() => run(() => startConfirm($, action))}
          />
        ))}
      </Box>
    )

    // 3줄째는 평소에 없고, 확인이나 선택지 행이 열려 있을 때만 생긴다.
    const row3 = confirm ? (
      <Box width={columns} justifyContent="space-between">
        <Text color={COLORS.confirm}>{`⚠ ${confirmText(confirm.kind, confirm.value)}`}</Text>
        <Box gap={1}>
          <Button key="confirm-yes" label={STRINGS.yes} onPress={() => void confirmYes($)} />
          <Button key="confirm-no" label={STRINGS.no} autoFocus onPress={() => void cancelConfirm($)} />
        </Box>
      </Box>
    ) : (
      menuRow
    )

    // 1줄째: 모델·노력 버튼과 구분선 뒤의 사용량 한도. 2줄째: 왼쪽 컨텍스트·계획, 오른쪽 동작 버튼.
    const tree = (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={COLORS.border}
        paddingX={1}
        width={e.props.bodyColumns}
      >
        <Box>
          {pickers}
          {segs(layout.limits)}
        </Box>
        <Box width={columns} justifyContent="space-between">
          <Box>{segs(buildRow2(usage, plan, columns - buttonsWidth(buttonLabels) - MIN_SPREAD))}</Box>
          {buttons}
        </Box>
        {row3}
      </Box>
    )

    return rest ? (
      <Box flexDirection="column">
        {tree}
        {rest}
      </Box>
    ) : (
      tree
    )
  })
}
