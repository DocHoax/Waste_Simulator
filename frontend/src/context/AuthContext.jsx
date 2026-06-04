import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

// Helper to get users from localStorage or initialize default super admin
function getMockUsers() {
  const usersJson = localStorage.getItem('waste_users');
  if (usersJson) {
    return JSON.parse(usersJson);
  }
  
  // Default super admin user
  const defaultAdmin = {
    id: 'user-admin-id',
    username: 'admin',
    email: 'admin@waste-system.com',
    password: 'admin123',
    role: 'super_admin',
    communityName: 'System Admin'
  };
  
  const initialUsers = [defaultAdmin];
  localStorage.setItem('waste_users', JSON.stringify(initialUsers));
  return initialUsers;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('auth_token'));
  const [loading, setLoading] = useState(true);

  // On mount, verify token if exists
  useEffect(() => {
    if (token) {
      verifyToken(token);
    } else {
      setLoading(false);
    }
  }, [token]);

  const verifyToken = (currentToken) => {
    try {
      const users = getMockUsers();
      // Token is just the user's ID in this mock setup
      const foundUser = users.find(u => u.id === currentToken);
      if (foundUser) {
        setUser({
          id: foundUser.id,
          username: foundUser.username,
          email: foundUser.email,
          role: foundUser.role,
          communityName: foundUser.communityName
        });
      } else {
        logout();
      }
    } catch (err) {
      console.error('Token verification failed:', err);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const users = getMockUsers();
    const foundUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!foundUser || foundUser.password !== password) {
      throw new Error('Invalid credentials');
    }
    
    const mockToken = foundUser.id;
    setToken(mockToken);
    setUser({
      id: foundUser.id,
      username: foundUser.username,
      email: foundUser.email,
      role: foundUser.role,
      communityName: foundUser.communityName
    });
    localStorage.setItem('auth_token', mockToken);
    
    return { token: mockToken, user: foundUser };
  };

  const register = async (username, email, password, communityName) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const users = getMockUsers();
    const emailExists = users.some(u => u.email.toLowerCase() === email.toLowerCase());
    if (emailExists) {
      throw new Error('Email is already registered');
    }
    
    const usernameExists = users.some(u => u.username.toLowerCase() === username.toLowerCase());
    if (usernameExists) {
      throw new Error('Username is already taken');
    }

    const newUser = {
      id: 'user-' + Math.random().toString(36).substr(2, 9),
      username,
      email,
      password,
      role: 'community_manager',
      communityName: communityName || username
    };
    
    users.push(newUser);
    localStorage.setItem('waste_users', JSON.stringify(users));
    
    const mockToken = newUser.id;
    setToken(mockToken);
    setUser({
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      communityName: newUser.communityName
    });
    localStorage.setItem('auth_token', mockToken);
    
    return { token: mockToken, user: newUser };
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth_token');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
