# 수업나눔 톡톡!카페 운영 앱

15개 주제 테이블(테이블당 7명)의 잔여 좌석, 3회차 운영, 발표 자료, 참여 소감과 추첨을 실시간으로 관리하는 Next.js 앱입니다.

## 로컬 실행

```bash
npm install
copy .env.example .env.local
npm run dev
```

`.env.local`에 다음 값을 설정합니다.

- `DATABASE_URL`: Neon PostgreSQL 접속 문자열
- `OPERATOR_PIN`: 운영 탭 보호용 PIN

데이터베이스 테이블과 인덱스는 첫 API 요청 시 안전하게 생성됩니다.

참석 기록, 소감, 자료 링크와 행사 상태는 브라우저가 아니라 Neon PostgreSQL에 저장됩니다. 사이트가 잠시 중단되거나 Vercel이 재배포되어도 저장 완료된 데이터는 유지되며, 운영 화면에서 **초기화**를 실행하거나 데이터베이스를 삭제한 경우에만 제거됩니다.

## Vercel 배포

1. Vercel 프로젝트에서 GitHub 저장소를 연결합니다.
2. **Settings → Build and Deployment → Root Directory**를 `toktok-cafe-app`으로 설정합니다.
3. Marketplace에서 Neon을 설치하고 이 프로젝트에 연결합니다.
4. `DATABASE_URL`이 자동 등록되었는지 확인합니다.
5. Environment Variables에 `OPERATOR_PIN`을 Sensitive 값으로 추가합니다.
6. 최신 커밋을 Redeploy 합니다.

Vercel은 Next.js를 자동 감지하므로 별도의 Build Command나 Output Directory를 지정하지 않습니다.
