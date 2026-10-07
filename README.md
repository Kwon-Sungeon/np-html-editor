# NP HTML 편집기

HTML 파일을 열고 화면에서 수정한 뒤 원래 파일에 저장하는 Windows 프로그램입니다.

## 다운로드 · v1.1.0

**[설치 파일 다운로드](https://github.com/Kwon-Sungeon/np-html-editor/releases/download/v1.1.0/NP-HTML-Editor-Setup-1.1.0-Windows-x64.exe)**

[설치 없이 사용하는 ZIP](https://github.com/Kwon-Sungeon/np-html-editor/releases/download/v1.1.0/NP-HTML-Editor-1.1.0-Windows-x64.zip) · [릴리스와 소스 코드](https://github.com/Kwon-Sungeon/np-html-editor/releases/latest)

Windows 10/11 64비트. 별도 Node.js 설치나 계정이 필요하지 않습니다.
기존 버전은 종료한 뒤 같은 위치에 새 버전을 설치하세요.

## macOS 다운로드 · v1.1.0

[Apple Silicon Mac용 DMG (M 시리즈)](https://github.com/Kwon-Sungeon/np-html-editor/releases/download/v1.1.0-macos/NP-HTML-Editor-1.1.0-macOS-arm64.dmg) · [Intel Mac용 DMG](https://github.com/Kwon-Sungeon/np-html-editor/releases/download/v1.1.0-macos/NP-HTML-Editor-1.1.0-macOS-x64.dmg)

DMG를 열고 앱을 **응용 프로그램**으로 드래그하세요. Mac에서는 **⌘O / ⌘S / ⌘⇧S**를 사용합니다.

Apple Developer ID 서명·공증을 받지 않은 배포본입니다. 첫 실행이 차단되면 [Apple의 실행 허용 안내](https://support.apple.com/ko-kr/102445)를 확인하세요.

[Mac 전용 배포 페이지·ZIP·소스 코드](https://github.com/Kwon-Sungeon/np-html-editor/releases/tag/v1.1.0-macos)

## 사용 방법

1. 프로그램 실행 → **내 PC에서 열기** → HTML 파일 선택
2. **문서 편집**에서 글·표 수정 또는 **디자인 편집**에서 배치·스타일 수정
3. **저장** 또는 **Ctrl+S** → 원래 HTML 파일에 반영

복사본은 **다른 이름으로 저장(Ctrl+Shift+S)**으로 만드세요. 저장 직전 파일은 `.np-backup`으로 보관합니다.

## v1.1.0

- Office 스타일의 파일 화면과 홈·삽입·보기 리본 메뉴
- 최근 문서 다시 열기, 문서 목차, 글자 수, 확대·축소
- 글꼴·단락·제목 스타일, 표·그림·링크 삽입, 찾기·바꾸기
- 밝은 디자인 패널과 서식·구조·추가 탭
- 첫 편집 실행 취소 및 모드 전환 시 스타일 중복 수정

TinyMCE와 GrapesJS 기반입니다. Microsoft Office와는 별개의 프로그램입니다.

## 배포 파일

- **Setup EXE**: 설치용. 설치 후 바탕화면의 NP HTML 편집기를 실행합니다.
- **Windows x64 ZIP**: 설치 없이 사용. 전체 압축을 풀고 내부 EXE를 실행합니다.
- **Source ZIP**: 개발용 소스 코드. 실행용 프로그램이 아닙니다.

정적 HTML 문서용입니다. 문서 스크립트는 편집 중 실행하지 않습니다.
코드 서명이 없는 배포본이므로 Windows에서 최초 실행 경고가 표시될 수 있습니다.

## 라이선스

GPL-2.0-or-later. 앱과 라이브러리의 소스·라이선스는 설치 파일에 포함된 Source ZIP과 릴리스의 Source ZIP에서 확인할 수 있습니다. 편집하는 문서의 권리는 해당 권리자에게 귀속됩니다.

