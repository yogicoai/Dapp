/**
 * 회원가입/로그인 — 베타. 아이디/비밀번호만 받는다.
 *
 * ⚠️ 베타 한정: 계정과 토큰을 이 기기의 localStorage에만 저장한다. 서버가 없어서
 * "실제 보안"은 아니다(기기 주인은 값을 볼 수 있다). Supabase Auth가 붙으면 이 파일의
 * 저장처만 서버로 바꾸면 된다 — 화면·호출부는 그대로 쓴다.
 */
import { SIGNUP_BONUS_TOKENS } from "./tokens";

export type BetaUser = {
  id: string;
  passHash: string;
  tokens: number;
  createdAt: string;
};

const USERS_KEY = "voice-storybook:users";
const SESSION_KEY = "voice-storybook:session";

/** 마스터(관리자) 계정 — 회원 목록·회원별 책장을 열람할 수 있다. 별도 가입 없이 로그인. */
export const MASTER_ID = "yogico";
const MASTER_PW = "korea2026!!";

export function isMaster(): boolean {
  return currentUserId() === MASTER_ID;
}

/** 베타용 간단 해시(djb2). 암호학적 보안이 아니라 평문 저장만 피하는 수준. */
function hash(s: string): string {
  let h = 5381;
  for (const ch of s) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}
function passHash(id: string, password: string): string {
  return hash(`${id}::${password}::voice-storybook`);
}

function loadUsers(): Record<string, BetaUser> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    const v = raw ? (JSON.parse(raw) as Record<string, BetaUser>) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function saveUsers(map: Record<string, BetaUser>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USERS_KEY, JSON.stringify(map));
}

/** 아이디 규칙 — 2~20자, 공백 없이. */
function normId(id: string): string {
  return id.trim().toLowerCase();
}

export type AuthResult = { ok: true; user: BetaUser } | { ok: false; error: string };

export function signUp(idRaw: string, password: string): AuthResult {
  const id = normId(idRaw);
  if (id.length < 2 || id.length > 20 || /\s/.test(id)) {
    return { ok: false, error: "아이디는 공백 없이 2~20자로 적어주세요." };
  }
  if (password.length < 4) {
    return { ok: false, error: "비밀번호는 4자 이상으로 적어주세요." };
  }
  const users = loadUsers();
  if (users[id]) return { ok: false, error: "이미 있는 아이디예요." };
  const user: BetaUser = {
    id,
    passHash: passHash(id, password),
    tokens: SIGNUP_BONUS_TOKENS, // 가입 보너스
    createdAt: new Date().toISOString(),
  };
  users[id] = user;
  saveUsers(users);
  setSession(id);
  return { ok: true, user };
}

export function logIn(idRaw: string, password: string): AuthResult {
  const id = normId(idRaw);
  const users = loadUsers();

  // 마스터 계정 — 가입 없이 고정 비번으로 로그인. 없으면 만들어 둔다.
  if (id === MASTER_ID) {
    if (password !== MASTER_PW) {
      return { ok: false, error: "아이디 또는 비밀번호가 틀렸어요." };
    }
    let master = users[MASTER_ID];
    if (!master) {
      master = { id: MASTER_ID, passHash: passHash(MASTER_ID, MASTER_PW), tokens: 9999, createdAt: new Date().toISOString() };
      users[MASTER_ID] = master;
      saveUsers(users);
    }
    setSession(MASTER_ID);
    return { ok: true, user: master };
  }

  const user = users[id];
  if (!user || user.passHash !== passHash(id, password)) {
    return { ok: false, error: "아이디 또는 비밀번호가 틀렸어요." };
  }
  setSession(id);
  return { ok: true, user };
}

export function logOut(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

function setSession(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, id);
}

export function currentUserId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_KEY);
}

export function currentUser(): BetaUser | null {
  const id = currentUserId();
  if (!id) return null;
  return loadUsers()[id] ?? null;
}

/** 전체 회원 목록 (마스터 열람용). 마스터 자신은 뺀다. */
export function loadAllUsers(): BetaUser[] {
  return Object.values(loadUsers()).filter((u) => u.id !== MASTER_ID);
}

/** 현재 토큰 잔액. 로그인 안 했으면 0. */
export function getTokens(): number {
  return currentUser()?.tokens ?? 0;
}

/** 토큰 차감 — 잔액이 충분하면 깎고 true, 부족하면 그대로 false. */
export function spendTokens(n: number): boolean {
  const id = currentUserId();
  if (!id) return false;
  const users = loadUsers();
  const user = users[id];
  if (!user || user.tokens < n) return false;
  user.tokens -= n;
  saveUsers(users);
  return true;
}

/** 토큰 충전(베타) — 나중에 결제로 대체. */
export function addTokens(n: number): void {
  const id = currentUserId();
  if (!id) return;
  const users = loadUsers();
  const user = users[id];
  if (!user) return;
  user.tokens += n;
  saveUsers(users);
}
