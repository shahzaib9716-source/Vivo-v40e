/** 
 * Authentication Hook for Haven Family Safety Application
 * Manages authentication state and provides auth-related functions
 */

import React, { useState, useEffect } from 'react';

export interface AuthUser {
  email: string;
  role: 'parent' | 'child';
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => void;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check for existing session on app start
    const storedUser = localStorage.getItem('authUser');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        setIsAuthenticated(true);
      } catch (e) {
        console.error('Failed to parse stored user:', e);
      }
    }
  }, []);

  const signIn = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    // In a real app, this would call the auth service
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Simple validation for demo purposes
      if (!email || !password) {
        return { success: false, error: 'Email and password are required' };
      }
      
      // For demo purposes, assume valid credentials
      const role = email.includes('parent') ? 'parent' : 'child';
      
      const newUser: AuthUser = { email, role };
      setUser(newUser);
      setIsAuthenticated(true);
      
      // Store in localStorage for persistence
      localStorage.setItem('authUser', JSON.stringify(newUser));
      
      return { success: true };
    } catch (error) {
      console.error('Sign in error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  };

  const signOut = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('authUser');
  };

  const value = {
    user,
    isAuthenticated,
    signIn,
    signOut
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};