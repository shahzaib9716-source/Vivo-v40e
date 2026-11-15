import { authService } from '../src/services/auth/service';

describe('AuthService', () => {
  beforeEach(() => {
    // Reset auth service before each test
    // In a real implementation, we'd need to properly reset the singleton
  });

  it('should initialize without errors', () => {
    expect(() => {
      authService.initialize();
    }).not.toThrow();
  });

  it('should create a pairing code', async () => {
    const parentUserId = 'parent_123';
    const pairingCode = await authService.createPairingCode(parentUserId);
    
    expect(pairingCode).toHaveProperty('code');
    expect(pairingCode).toHaveProperty('expiresAt');
    expect(pairingCode).toHaveProperty('parentUserId', parentUserId);
    expect(pairingCode).toHaveProperty('status', 'pending');
  });

  it('should validate a valid pairing code', async () => {
    const parentUserId = 'parent_123';
    const pairingCode = await authService.createPairingCode(parentUserId);
    
    // Mock the pairing to be valid
    const result = await authService.validateAndCompletePairing(pairingCode.code);
    
    expect(result).toHaveProperty('role', 'child');
  });

  it('should sign in a user with valid credentials', async () => {
    const email = 'test@example.com';
    const password = 'password123';
    
    const result = await authService.signIn(email, password);
    
    expect(result).toHaveProperty('email', email);
    expect(result).toHaveProperty('role', 'parent');
  });
});