import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  loginWithCrewCode,
  logoutUser,
  registerUser,
  onAuthChange,
  CrewUser,
} from '../lib/firebase/auth';

interface AuthContextType {
  user: CrewUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (crewCode: string, password: string) => Promise<void>;
  register: (crewCode: string, password: string, fullName: string, base: string, role: string, email?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CrewUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange((crewUser) => {
      setUser(crewUser);
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (crewCode: string, password: string) => {
    const crewUser = await loginWithCrewCode(crewCode, password);
    setUser(crewUser);
  };

  const register = async (crewCode: string, password: string, fullName: string, base: string, role: string, email?: string) => {
    const crewUser = await registerUser(crewCode, password, fullName, base, role, email);
    setUser(crewUser);
  };

  const logout = async () => {
    await logoutUser();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
