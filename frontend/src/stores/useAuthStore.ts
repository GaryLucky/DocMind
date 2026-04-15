import { create } from "zustand";

import { apiAuthLogin, apiAuthMe, apiAuthRegister, isAbortError } from "@/api";
import type { UserMeResponse } from "@/api/types";

const TOKEN_KEY = "access_token";

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (!token) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    return;
  }
}

export type AuthState = {
  token: string | null;
  user: UserMeResponse | null;
  status: "idle" | "loading" | "error";
  error?: string;
  login: (args: { username: string; password: string }) => Promise<boolean>;
  register: (args: { username: string; password: string }) => Promise<boolean>;
  fetchMe: () => Promise<void>;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  token: readToken(),
  user: null,
  status: "idle",
  error: undefined,

  async login(args) {
    set({ status: "loading", error: undefined });
    try {
      const token = await apiAuthLogin({ username: args.username, password: args.password });
      writeToken(token.access_token);
      set({ token: token.access_token });
      await get().fetchMe();
      set({ status: "idle" });
      return true;
    } catch (e) {
      if (isAbortError(e)) return false;
      set({ status: "error", error: e instanceof Error ? e.message : "登录失败" });
      return false;
    }
  },

  async register(args) {
    set({ status: "loading", error: undefined });
    try {
      await apiAuthRegister({ username: args.username, password: args.password });
      const token = await apiAuthLogin({ username: args.username, password: args.password });
      writeToken(token.access_token);
      set({ token: token.access_token });
      await get().fetchMe();
      set({ status: "idle" });
      return true;
    } catch (e) {
      if (isAbortError(e)) return false;
      set({ status: "error", error: e instanceof Error ? e.message : "注册失败" });
      return false;
    }
  },

  async fetchMe() {
    const { token } = get();
    if (!token) {
      set({ user: null });
      return;
    }
    try {
      const me = await apiAuthMe();
      set({ user: me });
    } catch (e) {
      if (isAbortError(e)) return;
      writeToken(null);
      set({ token: null, user: null });
    }
  },

  logout() {
    writeToken(null);
    set({ token: null, user: null, status: "idle", error: undefined });
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("auth:logout", () => {
    useAuthStore.getState().logout();
  });
  window.addEventListener("storage", (e) => {
    if (e.key !== TOKEN_KEY) return;
    const next = readToken();
    const current = useAuthStore.getState().token;
    if (next === current) return;
    useAuthStore.setState({ token: next, user: null });
  });
}
