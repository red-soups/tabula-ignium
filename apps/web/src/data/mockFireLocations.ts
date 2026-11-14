type FireLocation = {
  id: string
  name: string
  latitude: number
  longitude: number
}

// 시연 좌표는 십진수 도 단위입니다. 북위와 동경은 양수입니다.
export const mockFireLocations: readonly FireLocation[] = [
  { id: 'gyeongbuk', name: '대한민국 경북', latitude: 36.35, longitude: 128.62 },
  { id: 'kanto', name: '일본 간토', latitude: 36.52, longitude: 139.35 },
  { id: 'california', name: '미국 캘리포니아', latitude: 38.54, longitude: -121.25 },
  { id: 'amazon', name: '브라질 아마존', latitude: -8.76, longitude: -63.90 },
  { id: 'new-south-wales', name: '호주 뉴사우스웨일스', latitude: -33.70, longitude: 150.31 },
]

export type { FireLocation }
