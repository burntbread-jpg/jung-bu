export const TABLES = [
  { area: "교육과정·수업·평가", title: "질문으로 탐구하는 수업 만들기", staff: 1, capacity: 7 },
  { area: "독서교육", title: "책과 함께 자라는 교실", staff: 3, capacity: 5 },
  { area: "교과독서", title: "읽기로 여는 과학적 사고", staff: 1, capacity: 7 },
  { area: "기초학력", title: "차곡차곡 쌓아가는 기초학력", staff: 1, capacity: 7 },
  { area: "수학 교구·디지털", title: "수학 수업에 생각 더하기", staff: 2, capacity: 6 },
  { area: "AI·에듀테크", title: "처음 만나는 디벗, 기록하고 공유하며 성장하기", staff: 1, capacity: 7 },
  { area: "AI·에듀테크", title: "AI가 다 써주는데, 굳이 내가 쓰기", staff: 1, capacity: 7 },
  { area: "통합·특수교육", title: "다양함이 모이는 자리", staff: 1, capacity: 7 },
  { area: "생태전환교육", title: "다시 도전하는 나의 환경수업", staff: 1, capacity: 7 },
  { area: "인성교육", title: "실천으로 자라는 아이들, 사례로 나누는 인성교육", staff: 2, capacity: 6 },
  { area: "예술교육", title: "삶을 윤택하게 하는 예술교육", staff: 1, capacity: 7 },
  { area: "다문화교육", title: "다름이 빛이 되는 교실", staff: 1, capacity: 7 },
  { area: "창체", title: "영화 퀴즈-에듀씨네 씨네마킹!", staff: 1, capacity: 7 },
  { area: "유·초 연계 이음교육", title: "함께 이음 ON", staff: 3, capacity: 5 },
  { area: "유아 디지털교육", title: "유아도 교사도 즐기는 디지털 놀이", staff: 1, capacity: 7 },
] as const;

export const TABLE_CAPACITIES = Object.fromEntries(TABLES.map((table, index) => [index + 1, table.capacity])) as Record<number, number>;
export const TOTAL_PARTICIPANT_CAPACITY = TABLES.reduce((sum, table) => sum + table.capacity, 0);

export function tableCapacity(tableId: number) {
  return TABLE_CAPACITIES[tableId] ?? 0;
}
