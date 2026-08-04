import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  post?: string | null;
  role: "admin" | "user";
  canEditCalendar: boolean;
  status: "online" | "away" | "dnd" | "offline";
}

interface AuthContextType {
  user: User | null;
  serverUrl: string;
  hasAdmin: boolean;
  needsSchema: boolean;
  checkSystemStatus: () => Promise<void>;
  setupMasterAdmin: (email: string, username: string, password: string, displayName: string, avatarUrl?: string, post?: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  signUp: (email: string, username: string, password: string, displayName: string, post?: string) => Promise<void>;
  logout: () => void;
  updateProfile: (displayName: string, avatarUrl: string | null, post?: string | null) => Promise<void>;
  updateStatus: (status: User["status"]) => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SERVER_URL = "http://localhost:5001";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const serverUrl = SERVER_URL;
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasAdmin, setHasAdmin] = useState<boolean>(true); // default true until status check completes
  const [needsSchema, setNeedsSchema] = useState<boolean>(false);

  const checkSystemStatus = async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/auth/system-status`);
      if (response.ok) {
        const data = await response.json();
        setHasAdmin(data.hasAdmin);
        setNeedsSchema(!!data.needsSchema);
      }
    } catch (e) {
      console.error("System status check failed:", e);
    }
  };


  useEffect(() => {
    checkSystemStatus();

    // Restore session from localStorage
    const savedUser = localStorage.getItem("user_session");
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        // Refresh fresh profile permissions from backend
        fetch(`${SERVER_URL}/api/users`)
          .then((res) => (res.ok ? res.json() : null))
          .then((usersList) => {
            if (Array.isArray(usersList)) {
              const fresh = usersList.find((u: any) => u.id === parsedUser.id);
              if (fresh && !fresh.isDisabled) {
                const updated: User = {
                  id: fresh.id,
                  username: fresh.username,
                  displayName: fresh.displayName,
                  avatarUrl: fresh.avatarUrl,
                  post: fresh.post,
                  role: fresh.role,
                  canEditCalendar: Boolean(fresh.canEditCalendar) || fresh.role === "admin",
                  status: fresh.status
                };
                setUser(updated);
                localStorage.setItem("user_session", JSON.stringify(updated));
              } else {
                // User disabled or not found in database -> force return to Auth Screen
                setUser(null);
                localStorage.removeItem("user_session");
              }
            }
          })
          .catch(() => {
            // If backend fails, show auth page
          });
      } catch (e) {
        localStorage.removeItem("user_session");
        setUser(null);
      }
    }
    setIsLoading(false);
  }, []);

  const setupMasterAdmin = async (
    email: string,
    username: string,
    password: string,
    displayName: string,
    avatarUrl?: string,
    post?: string
  ) => {
    try {
      const response = await fetch(`${serverUrl}/api/auth/setup-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password, displayName, avatarUrl, post })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Master Admin setup failed");
      }

      setHasAdmin(true);
    } catch (error: any) {
      console.error("Master Admin Setup Error:", error);
      throw error;
    }
  };

  const signUp = async (email: string, username: string, password: string, displayName: string, post?: string) => {
    try {
      const response = await fetch(`${serverUrl}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password, displayName, post })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Sign up failed");
      }
    } catch (error: any) {
      console.error("SignUp Error:", error);
      throw error;
    }
  };

  const login = async (username: string, password: string) => {
    try {
      const response = await fetch(`${serverUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Login failed");
      }

      const userData = await response.json();

      if (userData.accessToken && userData.refreshToken) {
        await supabase.auth.setSession({
          access_token: userData.accessToken,
          refresh_token: userData.refreshToken
        });
      }

      const mappedUser: User = {
        id: userData.id,
        username: userData.username,
        displayName: userData.displayName,
        avatarUrl: userData.avatarUrl,
        post: userData.post,
        role: userData.role,
        canEditCalendar: userData.canEditCalendar || userData.role === "admin",
        status: userData.status
      };

      setUser(mappedUser);
      localStorage.setItem("user_session", JSON.stringify(mappedUser));
    } catch (error: any) {
      console.error("Login Error:", error);
      throw error;
    }
  };

  const logout = () => {
    if (user) {
      fetch(`${serverUrl}/api/users/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, status: "offline" })
      }).catch(() => {});
    }
    supabase.auth.signOut().catch(() => {});
    setUser(null);
    localStorage.removeItem("user_session");
  };

  const updateProfile = async (displayName: string, avatarUrl: string | null, post?: string | null) => {
    if (!user) return;
    try {
      const response = await fetch(`${serverUrl}/api/users/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, displayName, avatarUrl, post })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Profile update failed");
      }

      const updatedUser = { ...user, displayName, avatarUrl, post: post !== undefined ? post : user.post };
      setUser(updatedUser);
      localStorage.setItem("user_session", JSON.stringify(updatedUser));
    } catch (error) {
      console.error("Profile Update Error:", error);
      throw error;
    }
  };

  const updateStatus = async (status: User["status"]) => {
    if (!user) return;
    try {
      const response = await fetch(`${serverUrl}/api/users/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, status })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Status update failed");
      }

      const updatedUser = { ...user, status };
      setUser(updatedUser);
      localStorage.setItem("user_session", JSON.stringify(updatedUser));
    } catch (error) {
      console.error("Status Update Error:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        serverUrl,
        hasAdmin,
        needsSchema,
        checkSystemStatus,
        setupMasterAdmin,

        login,
        signUp,
        logout,
        updateProfile,
        updateStatus,
        isLoading
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

