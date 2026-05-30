# Classic Sudoku Web App

브라우저에서 `index.html`을 열면 바로 플레이할 수 있는 클래식 스도쿠 웹앱입니다.

## 기능

- 9x9 클래식 스도쿠
- 쉬움, 보통, 어려움 난이도
- 쉬움 10분 안에 5개 완료 시 보통 잠금 해제
- 보통 30분 안에 4개 완료 시 어려움 잠금 해제
- 잠긴 난이도 버튼 비활성화
- 현재 게임, 선택 칸, 타이머, 실수, 잠금 해제 진행률 저장
- 중간에 나갔다가 다시 열면 이어하기
- 별도 `battle.html` 대전모드
- 대전모드 실시간 채팅

## 대전모드

GitHub Pages는 파일을 보여주는 서비스라서 실시간 대전을 하려면 Firebase Realtime Database 같은 실시간 저장소가 필요합니다.

`battle.js` 상단의 `firebaseConfig` 값을 실제 Firebase 프로젝트 설정값으로 바꾸면 대전모드를 사용할 수 있습니다.

대전모드에서는 같은 방에 접속한 플레이어끼리 진행률과 채팅 메시지를 실시간으로 주고받습니다.

Firebase Realtime Database 테스트용 규칙 예시는 아래와 같습니다. 공개 테스트용으로만 쓰고, 실제 서비스 전에는 보안 규칙을 강화해야 합니다.

```json
{
  "rules": {
    "rooms": {
      "$room": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

## 실행

- 혼자하기: `index.html`
- 대전모드: `battle.html`
