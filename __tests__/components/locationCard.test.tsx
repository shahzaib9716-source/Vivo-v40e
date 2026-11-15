import React from 'react';
import { render } from '@testing-library/react-native';
import { LocationCard } from '../../src/components/location/LocationCard';

describe('LocationCard', () => {
  const mockLocationData = {
    latitude: 40.7128,
    longitude: -74.0060,
    accuracy: 5.2,
    altitude: 10.5,
    speed: 2.3,
    bearing: 45,
    timestamp: new Date(),
    batteryLevel: 85,
  };

  it('should render with location data', () => {
    const { getByText } = render(
      <LocationCard location={mockLocationData} />
    );
    
    expect(getByText('Current Location')).toBeTruthy();
    expect(getByText('40.712800, -74.006000')).toBeTruthy();
  });

  it('should render placeholder when no location data', () => {
    const { getByText } = render(
      <LocationCard location={null} />
    );
    
    expect(getByText('No location data available')).toBeTruthy();
  });
});