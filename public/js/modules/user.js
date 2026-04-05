// User Module - Manages user authentication and profile using localStorage
const User = (() => {
  const STORAGE_KEY = 'rpsc_user';
  const SESSION_KEY = 'rpsc_session';

  const defaultUser = {
    id: null,
    name: '',
    email: '',
    createdAt: null,
    lastLogin: null
  };

  const login = (userData) => {
    if (!userData.name || !userData.email) {
      throw new Error('Name and Email are required');
    }

    // Check if user exists, if not create new
    let user = getUser();
    if (!user.id) {
      user.id = `user_${Date.now()}`;
      user.createdAt = new Date().toISOString();
    }

    user.name = userData.name;
    user.email = userData.email;
    user.lastLogin = new Date().toISOString();

    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    sessionStorage.setItem(SESSION_KEY, 'true');
    
    console.log('✓ User logged in:', user.name);
    return user;
  };

  const logout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    console.log('✓ User logged out');
  };

  const getUser = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    try {
      return stored ? JSON.parse(stored) : { ...defaultUser };
    } catch {
      return { ...defaultUser };
    }
  };

  const isLoggedIn = () => {
    return sessionStorage.getItem(SESSION_KEY) === 'true' && getUser().id !== null;
  };

  const updateProfile = (updates) => {
    const user = getUser();
    const updated = { ...user, ...updates };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  };

  return {
    login,
    logout,
    getUser,
    isLoggedIn,
    updateProfile
  };
})();
