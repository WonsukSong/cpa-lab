# CPA 예상문제집 정기 갱신 규칙

이 저장소는 사용자가 승인한 비밀번호 보호 검토판이다. 정기 작업은 기존 교과서를 바꾸지 않고 `question-bank.enc.json`을 갱신한다. 사이트 비밀번호나 개인키는 필요하지 않다.

## 입력과 범위

1. 예약 작업에 지정된 비공개 `CPA_Question_Bank.json`의 최신 버전·Library ID를 읽고, 작업용 파일로 준비한다. 이전 실행의 임시 파일을 원본으로 가정하지 않는다.
2. GitHub 연결로 `WonsukSong/cpa-lab`의 현재 main HEAD·트리와 `question-bank.enc.json`, `question-bank-key.json`, `question-bank-schema.js`, `question-bank-tools.mjs`를 읽는다. 공개키 외에는 키를 만들거나 교체하지 않는다.
3. 비공개 원본의 revision과 배포 대상 암호문의 bankRevision이 일치해야 한다. 불일치하면 새 문제를 배포하지 말고 이전 실행 결과를 확인·복구한다. 기존 암호문을 복호화하려고 비밀번호를 찾거나 요청하지 않는다.

## 문제 작성과 검토

기본 추가 목표는 8과목별 1문항, 합계 8문항이다. 검토에 통과한 문항만 추가한다. 기존 문항의 ID·내용·풀이와 과목별 진도는 유지하고, 의미상 중복 문항은 만들지 않는다. 숫자만 바꾼 반복보다 개념 연결·조건 판별·오답 원인을 다르게 구성한다.

모든 문제는 독자 창작이며 실제 기출·예측 확률로 표시하지 않는다. 현재 출제범위·시행계획은 금융위원회 및 공인회계사시험 공식 자료를 확인한다. 회계·감사 기준은 KASB·KICPA·IFRS·IAASB, 세법·기업법은 국세청·공포된 국가법령정보센터 원문을 우선한다. 정부안·공개초안을 확정 규정으로 쓰지 않는다. 국내 시행일과 시험 적용 기준일을 구분한다. 확정되지 않은 세율·법령 적용이 필요한 문항은 보류하고 확실한 개념·명시적 가상 조건 문제를 사용한다.

객관식은 5개의 중복 없는 보기와 유일한 정답을 두며, 서술형은 단계별 모범답안·자가점검 기준을 제공한다. 시점·단위·가정을 적고 최소 3단계 풀이·오답 포인트·검산·관련 본문·공식 근거 URL·확인일을 기록한다. 수치는 별도 코드로 다시 계산하고 객관식 보기의 유일성을 확인한다. 가능하면 작성자와 별도의 검토를 수행한다. 근거를 열어보지 않거나 계산을 검증하지 못했으면 reviewed로 표시하지 않는다.

유지할 구조는 `version:1`, `examYear:2027`, 새 고유 revision, 날짜 updatedAt, 기존 questions 전체와 새 질문, batches의 추가 기록이다. 각 문항은 고유 id·subject·type·difficulty·title·stem·assumptions·lessonIds·options·answerIndex·answer·solution·basis·review·revision을 갖춘다. MCQ는 보기 5개, 서술형은 빈 보기와 null 인덱스를 사용한다. 새 문항은 revision 1, 기존 수정은 같은 ID에서 revision 증가 및 수정 이유를 기록한다. 철회 문항은 삭제 대신 status withdrawn으로 남긴다.

## 검증·암호화·배포

1. 공개 스키마 파일을 로컬 `question-bank-schema.cjs`로 저장하고 `require()`한 검증 함수를 완전한 새 은행에 적용한다. 스키마의 교과서 연결 ID와 과목을 유지한다. 스키마 자체를 약화하지 않는다.
2. 공개 도구를 `question-bank-tools.mjs`로 저장한다. `node question-bank-tools.mjs encrypt --input BANK.json --key PUBLIC_KEY.json --output NEW_ENVELOPE.json`으로 새 경로에 암호화한다. 현재 공개키를 사용하며 새 키 생성·개인키·사이트 비밀번호를 사용하지 않는다.
3. 바이트 해시와 envelope.bankRevision을 기록한다. 암호문이 평문 질문·정답이나 키의 개인 부분을 포함하지 않는지 확인한다. 공개키와 스키마·도구에 변경이 없어야 한다.
4. GitHub의 현재 HEAD를 다시 읽고 변경되었으면 새 트리를 대조한다. `question-bank.enc.json`만 업데이트하는 트리·커밋을 만들고 부모 HEAD를 expected_sha로 둔 fast-forward ref 갱신을 사용한다. force push를 하지 않는다.
5. GitHub Pages 배포 작업의 성공과 해당 커밋을 확인한 뒤, 게시된 암호문을 읽어 해시와 bankRevision을 대조한다. 실제 서버 응답 확인이 막히면 배포 확인 범위를 명확히 보고한다.
6. 배포 성공 후 비공개 원본을 같은 Library ID에 관측한 버전 guard를 사용해 교체한다. 배포가 실패하거나 원본 저장 결과가 불명확하면 중복 실행·재추가·새 배포를 하지 말고 상태를 보고한다. 배포된 revision과 같은 원본을 먼저 복구한다.
7. 사용자에게 추가한 수·과목·핵심 주제·보류 및 수정 사항과 접속 링크를 간단히 보고한다. 검토가 끝나지 않은 새 문항을 반영하지 않는다.

## 공개 금지

평문 은행, 질문 초안, 전체 소스 ZIP, bootstrap/seed JS, RSA 개인키, 사이트 비밀번호, 연결 토큰과 비공개 Library 식별자를 저장소에 올리지 않는다. 기존 index.html·잠금·사용자 접근 범위를 변경하지 않는다. Library 저장을 위한 인증 자료를 코드·파일·작업 프롬프트에 적지 않는다.
