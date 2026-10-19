[English](README.md) | **한국어** | [日本語](README.ja.md)

# Cockpit

Claude Code 세션 주위에 조종석을 만들어 주는 mod입니다. 날씨 스타일의 컨텍스트 밴드, 플랜 진행률, 사용량 한도, 모델·effort 선택기, 그리고 실행 전에 확인을 거치는 Resume / Rewind / Compact / Clear 버튼을 제공합니다.

<!-- TODO: 스크린샷 또는 GIF 추가 -->
![Cockpit 개요](screenshots/cockpit-overview.png)

## 제공 기능

<!-- TODO: 터미널에서 밴드가 보이는 모습을 텍스트로 붙여넣기 -->

| 구성 요소 | 설명 |
| --- | --- |
| 컨텍스트 밴드 | 컨텍스트 창이 얼마나 찼는지 날씨 예보 형태로 보여 줍니다. |
| 플랜 진행률 | 현재 플랜의 진행 상황을 보여 줍니다. |
| 사용량 한도 | 사용량 한도를 얼마나 썼는지 보여 줍니다. |
| 모델 선택기 | 조종석에서 모델을 전환합니다. |
| Effort 선택기 | 조종석에서 reasoning effort를 전환합니다. |
| Resume / Rewind / Compact / Clear | 같은 이름의 명령을 실행하는 버튼입니다. 실행 전에 항상 확인을 받습니다. |

## 데모

<!-- TODO: 상태별 스크린샷과 한 줄 설명 -->

## 동작 방식

이 mod는 hooks 모듈 하나(`hooks/register.tsx`)와 보조 함수(`hooks/lib.ts`)로 구성됩니다.

| Hook | 하는 일 |
| --- | --- |
| <!-- TODO --> | <!-- TODO --> |

<!-- TODO: 모듈이 실제로 사용하는 이벤트와 ui.render 컴포넌트를 나열 -->

## 실행하기

**요구 사항**

- Claude Code <!-- TODO: 테스트한 최소 버전 --> 이상 (mod가 기본으로 로드되는 버전)
- 터미널 환경 <!-- TODO: 다른 환경 지원 여부 -->

**이 저장소에서 설치**

```bash
claude plugin marketplace add Hugo-Jang/claude-cockpit-mods
claude plugin install cockpit-mods@claude-cockpit-mods --scope user
```

Claude Code 세션 안에서는 다음과 같이 입력합니다.

```text
/plugin install cockpit-mods --marketplace Hugo-Jang/claude-cockpit-mods
```

**설치하지 않고 한 세션만 사용**

```bash
git clone https://github.com/Hugo-Jang/claude-cockpit-mods.git
cd claude-cockpit-mods
claude --plugin-dir ./cockpit
```

**개발과 테스트**

```bash
claude plugin validate ./cockpit
claude plugin test ./cockpit
```

## 참고 / 제한 사항

<!-- TODO: 예시 -->
- <!-- 정확한 수치와 추정치의 구분 -->
- <!-- 다른 플러그인이 프롬프트 위 밴드를 같이 그릴 때의 동작 -->
- <!-- 세션 시작이나 플러그인 리로드 시 초기화되는 항목 -->

## 의존성

| 이름 | 버전 | 라이선스 (SPDX) | 출처 |
| --- | --- | --- | --- |
| 없음 | | | |

## 서드파티 고지

없음.

## 작성자

[Hugo-Jang](https://github.com/Hugo-Jang)

## 라이선스

[MIT](../LICENSE)

---

있는 그대로 공유합니다. Anthropic 공식 제품이 아니며, 지원이나 유지보수를 보장하지 않습니다.
