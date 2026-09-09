'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import styles from './MyPage.module.css';

import { sessionQueries } from '@/entities/session';
import { buildLoginUrl } from '@/features/auth';

export function MyPage() {
  return (
    <section className="week05-section" aria-labelledby="my-title">
      <h1 id="my-title">마이페이지</h1>
      <MyContent />
    </section>
  );
}

function MyContent() {
  const {
    data: user,
    isPending,
    isError,
    refetch,
  } = useQuery(sessionQueries.me());

  return (
    <>
      {user ? (
        <div className={styles.accountCard}>
          <p className={styles.name}>{user.name}</p>
          <p className={styles.email}>{user.email}</p>
        </div>
      ) : isPending ? (
        <div className={styles.accountCard}>
          <p className={styles.loginNotice}>계정 정보를 확인하는 중</p>
        </div>
      ) : isError ? (
        // 확인 실패는 비로그인이 아니다. 기존 사용자를 지우지 않고 재시도만 받는다.
        <div className={styles.accountCard} role="alert">
          <p className={styles.loginNotice}>
            로그인 상태를 확인하지 못했습니다.
          </p>
          <button
            type="button"
            className={styles.loginButton}
            onClick={() => {
              void refetch();
            }}
          >
            다시 시도
          </button>
        </div>
      ) : (
        <div className={styles.accountCard}>
          <p className={styles.loginNotice}>
            로그인하면 주문 내역과 계정 정보를 확인할 수 있습니다.
          </p>
          <Link
            className={styles.loginButton}
            href={buildLoginUrl('/my', { from: 'my' })}
          >
            로그인
          </Link>
        </div>
      )}

      <nav aria-label="마이 메뉴">
        <ul className={styles.menu}>
          <li className={styles.menuItem}>
            <Link className={styles.menuLink} href="/cart">
              장바구니
            </Link>
          </li>
          <li className={styles.menuItem}>
            {/* 비로그인 진입은 proxy가 로그인 화면을 거쳐 돌아오게 한다 */}
            <Link className={styles.menuLink} href="/orders">
              주문 내역
              {!user && <span className={styles.menuHint}>로그인 필요</span>}
            </Link>
          </li>
        </ul>
      </nav>
    </>
  );
}
