export type Usage = {
  tokens: number | null
  window: number | null
  percent: number | null
  delta: number | null
}

export type Plan = { done: number; total: number; current: string | null }

// config.list 행: 현재 값과 선택지
export type Choice = { value: string; options: string[] }

// 사용량 한도 한 칸. 엔진이 주지 않은 값은 null로 둔다.
export type Limit = { kind: string; percentUsed: number | null; resetsAt: string | null }

export type Stamped = { value: string; at: number }

// 고른 값과 고른 시각. via는 적용에 쓴 경로(config.set, command.run, turn.step) 또는 직접 입력(typed)
export type EffortSelection = Stamped & { via: string }

// 노력 값의 출처. 선택과 마지막 메인 요청이 실제로 실은 값을 각각 시각과 함께 둔다.
export type EffortState = {
  selection: EffortSelection | null
  request: Stamped | null
}

// 예/아니오 확인을 기다리는 동작. token은 요청 시각으로, 10초 타이머가 자기 요청만 취소하게 한다.
export type Confirm = {
  kind: 'resume' | 'rewind' | 'compact' | 'clear' | 'model'
  value: string
  token: number
}

declare module 'claude-code' {
  interface PluginState {
    'cockpit-mods': {
      usage: Usage | null
      plan: Plan | null
      model: Choice | null
      // $.session.model()의 원본 문자열. 못 읽으면 빈 문자열
      modelName: string
      limits: Limit[]
      // 1분마다 올려서 리셋 카운트다운을 다시 그리게 한다
      tick: number
      confirm: Confirm | null
      // 펼쳐진 선택지 행. 한 번에 하나만 열린다
      menu: 'model' | 'effort' | null
      effort: EffortState
    }
  }
}
