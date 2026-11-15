/**
 * Location Card Component for Haven Family Safety Application
 * Displays location information including coordinates, accuracy, and battery level
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  bearing?: number;
  timestamp: Date;
  batteryLevel?: number;
}

interface LocationCardProps {
  location: LocationData | null;
}

export const LocationCard: React.FC<LocationCardProps> = ({ location }) => {
  if (!location) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Current Location</Text>
        <Text style={styles.placeholder}>No location data available</Text>
      </View>
    );
  }

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleString();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Current Location</Text>
      
      <View style={styles.locationInfo}>
        <Text style={styles.coordinateText}>
          {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
        </Text>
        
        {location.accuracy !== undefined && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Accuracy:</Text>
            <Text style={styles.value}>{location.accuracy.toFixed(1)}m</Text>
          </View>
        )}
        
        {location.altitude !== undefined && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Altitude:</Text>
            <Text style={styles.value}>{location.altitude.toFixed(1)}m</Text>
          </View>
        )}
        
        {location.speed !== undefined && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Speed:</Text>
            <Text style={styles.value}>{location.speed.toFixed(1)} km/h</Text>
          </View>
        )}
        
        {location.bearing !== undefined && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Bearing:</Text>
            <Text style={styles.value}>{location.bearing}°</Text>
          </View>
        )}
        
        {location.batteryLevel !== undefined && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Battery:</Text>
            <Text style={styles.value}>{location.batteryLevel}%</Text>
          </View>
        )}
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>Last Updated:</Text>
          <Text style={styles.value}>{formatDate(location.timestamp)}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  placeholder: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
  },
  locationInfo: {
    flexDirection: 'column',
  },
  coordinateText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    color: '#666',
  },
  value: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
});