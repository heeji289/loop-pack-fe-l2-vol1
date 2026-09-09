/**
 * 문서 이동(전체 페이지 교체). 라우터 이동과 달리 서버가 화면을 새로 그린다.
 * jsdom은 실제 이동을 구현하지 않으므로 테스트는 이 모듈을 mock으로 대체한다.
 */
export function replaceDocument(url: string) {
  window.location.replace(url);
}
