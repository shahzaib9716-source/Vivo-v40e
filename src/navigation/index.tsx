/**
 * Main Navigation Component for Haven Family Safety Application
 * Sets up tab navigation between different application sections
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { PairingScreen } from '../screens/auth/PairingScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { PermissionsGuideScreen } from '../screens/PermissionsGuideScreen';
import { WhatsAppEnhancedScreen } from '../screens/social/WhatsAppEnhancedScreen';
import { InstagramScreen } from '../screens/social/InstagramScreen';
import { SnapchatScreen } from '../screens/social/SnapchatScreen';
import { PhoneCallEnhancedScreen } from '../screens/calls/PhoneCallEnhancedScreen';

// Define types for our navigation
export type RootStackParamList = {
  Login: undefined;
  Pairing: undefined;
  Dashboard: undefined;
  Permissions: undefined;
  WhatsApp: undefined;
  Instagram: undefined;
  Snapchat: undefined;
  PhoneCalls: undefined;
};

const Tab = createBottomTabNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: 'gray',
        }}
      >
        <Tab.Screen 
          name="Login" 
          component={LoginScreen} 
          options={{ title: 'Sign In' }}
        />
        <Tab.Screen 
          name="Pairing" 
          component={PairingScreen} 
          options={{ title: 'Pair Device' }}
        />
        <Tab.Screen 
          name="Dashboard" 
          component={DashboardScreen} 
          options={{ title: 'Dashboard' }}
        />
        <Tab.Screen 
          name="WhatsApp" 
          component={WhatsAppEnhancedScreen} 
          options={{ title: 'WhatsApp' }}
        />
        <Tab.Screen 
          name="Instagram" 
          component={InstagramScreen} 
          options={{ title: 'Instagram' }}
        />
        <Tab.Screen 
          name="Snapchat" 
          component={SnapchatScreen} 
          options={{ title: 'Snapchat' }}
        />
        <Tab.Screen 
          name="PhoneCalls" 
          component={PhoneCallEnhancedScreen} 
          options={{ title: 'Calls' }}
        />
        <Tab.Screen 
          name="Permissions" 
          component={PermissionsGuideScreen} 
          options={{ title: 'Permissions' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};