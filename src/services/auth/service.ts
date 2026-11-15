/**
 * Authentication Service for Haven Family Safety Application
 * Handles user authentication and pairing logic
 */

export interface AuthResult {
  success: boolean;
  error?: string;
  email?: string;
  role?: 'parent' | 'child';
}

export interface PairingCode {
  code: string;
  expiresAt: Date;
  parentUserId: string;
  status: 'pending' | 'active' | 'expired';
}

class AuthService {
  private initialized = false;

  /**
   * Initialize the authentication service
   */
  initialize(): void {
    if (!this.initialized) {
      // In a real implementation, this would set up Firebase or other auth providers
      console.log('Authentication service initialized');
      this.initialized = true;
    }
  }

  /**
   * Sign in a user with email and password
   */
  async signIn(email: string, password: string): Promise<AuthResult> {
    // In a real implementation, this would call Firebase or backend API
    try {
      // Simulate network request delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Simple validation for demo purposes
      if (!email || !password) {
        return {
          success: false,
          error: 'Email and password are required'
        };
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return {
          success: false,
          error: 'Invalid email format'
        };
      }
      
      // In a real app, we would validate credentials against backend
      // For demo purposes, we'll assume valid credentials for common test accounts
      const isValidUser = email === 'parent@example.com' || email === 'child@example.com';
      
      if (!isValidUser) {
        return {
          success: false,
          error: 'Invalid credentials'
        };
      }
      
      // Determine role based on email
      const role = email.includes('parent') ? 'parent' : 'child';
      
      return {
        success: true,
        email,
        role
      };
    } catch (error) {
      console.error('Sign in error:', error);
      return {
        success: false,
        error: 'An unexpected error occurred during sign in'
      };
    }
  }

  /**
   * Create a new pairing code for a parent
   */
  async createPairingCode(parentUserId: string): Promise<PairingCode> {
    try {
      // In a real implementation, this would generate and store a secure pairing code
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Generate a random 6-character pairing code
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      // Set expiration to 15 minutes from now
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      
      return {
        code,
        expiresAt,
        parentUserId,
        status: 'pending'
      };
    } catch (error) {
      console.error('Pairing code generation error:', error);
      throw new Error('Failed to generate pairing code');
    }
  }

  /**
   * Validate and complete a pairing process
   */
  async validateAndCompletePairing(pairingCode: string): Promise<{ role: 'parent' | 'child' }> {
    try {
      // In a real implementation, this would verify the pairing code against backend
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // Simple validation for demo purposes
      if (!pairingCode || pairingCode.length !== 6) {
        throw new Error('Invalid pairing code format');
      }
      
      // In a real app, we would check if the code exists and is valid
      // For demo, we'll assume any 6-character code works
      
      // Return child role as default for pairing
      return { role: 'child' };
    } catch (error) {
      console.error('Pairing validation error:', error);
      throw new Error('Failed to validate pairing code');
    }
  }
}

// Export a singleton instance
export const authService = new AuthService();