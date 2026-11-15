import React from 'react';
import { render } from '@testing-library/react-native';
import { AppNavigator } from '../src/navigation';

describe('Navigation', () => {
  it('should render without crashing', () => {
    expect(() => {
      render(<AppNavigator />);
    }).not.toThrow();
  });

  // Note: Actual navigation tests would require more complex setup
  // This is a placeholder for future implementation
});