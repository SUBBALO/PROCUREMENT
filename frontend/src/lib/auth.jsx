import React, { createContext, useContext, useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=loading, false=unauth, object=auth
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => setUser(false))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    try {
      const { data } = await api.post("/auth/login", { username, password });
      setUser(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) };
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    setUser(false);
  };

  const refresh = async () => {
    try {
      const r = await api.get("/auth/me");
      setUser(r.data);
    } catch { setUser(false); }
  };

  return <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// ============= Role helpers (cermin backend deps.py) =============
// ADMIN_LIKE_ROLES = ("admin", "supervisor", "super_admin")
export const isAdminLike = (user) =>
  ["admin", "supervisor", "super_admin"].includes(user?.role);

// Cermin backend can_see_prices(): store → tidak; finance/admin-like → ya;
// selain itu butuh perm "view_store_report".
export const canSeeStorePrices = (user) => {
  if (!user) return false;
  if (user.role === "store") return false;
  if (user.role === "finance" || isAdminLike(user)) return true;
  return (user.perms || []).includes("view_store_report");
};
