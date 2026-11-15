# Haven Family Safety Application

## Overview

This repository contains the implementation of the Haven family safety application, designed to provide comprehensive parental supervision and monitoring capabilities for families. The application supports both Parent and Child roles with secure pairing and data synchronization.

## Project Structure

```
.
├── src/
│   ├── components/          # Reusable UI components
│   ├── screens/             # Application screens
│   ├── services/            # Business logic and services
│   ├── utils/               # Utility functions
│   ├── types/               # TypeScript type definitions
│   └── navigation/          # Navigation configuration
├── assets/                  # Static assets
├── app.json                 # Expo configuration
├── package.json             # Project dependencies
└── __tests__/               # Unit tests
```

## Features Implemented

1. **Parent-Child Pairing System**
2. **Location Monitoring and Geofencing**
3. **Phone Call Management**
4. **Camera and Audio Sessions**
5. **Screen Sharing and Snapshots** 
6. **Social Applications Monitoring**
7. **Keyword Alerts**
8. **Notification Management**
9. **Screen Time and App Restrictions**
10. **Secure Data Storage and Synchronization**

## Technology Stack

- React Native 0.73
- Expo SDK 49
- TypeScript
- Firebase Authentication
- Cloud Firestore
- Expo Router
- EAS Build

## Screenshot System

This application includes a comprehensive screenshot system for documentation and testing purposes:

### Features:
- **Manual Screenshot Capture**: Take screenshots on-demand from any screen
- **Periodic Screenshot Capture**: Automatically capture screenshots at set intervals
- **Screenshot Management**: List, organize, and clean up screenshots  
- **Metadata Support**: Attach descriptions to screenshots for better organization

### Screenshot Intervals (as requested in chat prompt):

The system supports specific interval sequences for detailed documentation:

#### Sequence of Intervals:
1. **30 seconds**: Initial testing and quick verification
2. **1 minute**: Regular monitoring during active development  
3. **90 seconds (1.5 minutes)**: Mid-development documentation
4. **4 minutes**: Ongoing documentation with reduced frequency

#### Usage Example for Specific Intervals:
```typescript
import { setupSpecificIntervalScreenshots } from './utils/screenshots/periodicScreenshotSetup';

// Start the specific interval sequence
const stopCapture = setupSpecificIntervalScreenshots();
// Captures will automatically transition through the intervals
```

#### Standard Periodic Capture (30 minutes)
- **Purpose**: General documentation and verification during development
- **Screens Captured**: Dashboard, WhatsApp, Phone Calls, Instagram, Snapchat
- **Frequency**: Every 30 minutes
- **Use Case**: Regular monitoring of core application functionality

#### Intensive Development Capture (5 minutes)  
- **Purpose**: Active development testing and debugging
- **Screens Captured**: All main screens including Login and Pairing
- **Frequency**: Every 5 minutes
- **Use Case**: During active feature development and testing

#### Milestone Documentation (15 minutes)
- **Purpose**: Key milestone documentation during development
- **Screens Captured**: Dashboard, WhatsApp, Phone Calls only
- **Frequency**: Every 15 minutes
- **Use Case**: Important development milestones and feature completions

### Usage:
The screenshot system can be accessed through the utility functions in `src/utils/screenshots/`.

To use periodic screenshots during development:
```typescript
import { setupPeriodicScreenshots } from './utils/screenshots/periodicScreenshotSetup';

// Start periodic screenshots every 30 minutes
const stopCapture = setupPeriodicScreenshots();
// Call stopCapture() to stop the periodic capture
```

### Documentation:
For detailed information about the screenshot system, see `docs/screenshots/SCREENSHOT_SYSTEM.md`.

#### Milestone Documentation (15 minutes)
- **Purpose**: Key milestone documentation during development
- **Screens Captured**: Dashboard, WhatsApp, Phone Calls only
- **Frequency**: Every 15 minutes
- **Use Case**: Important development milestones and feature completions

### Usage:
The screenshot system can be accessed through the utility functions in `src/utils/screenshots/`.

To use periodic screenshots during development:
```typescript
import { setupPeriodicScreenshots } from './utils/screenshots/periodicScreenshotSetup';

// Start periodic screenshots every 30 minutes
const stopCapture = setupPeriodicScreenshots();
// Call stopCapture() to stop the periodic capture
```

### Documentation:
For detailed information about the screenshot system, see `docs/screenshots/SCREENSHOT_SYSTEM.md`.

## Testing

This project includes a comprehensive testing setup with:
- Unit tests for services and components
- Navigation tests
- Component rendering tests

To run tests:
```bash
npm test
```

## Getting Started

1. Install dependencies: `npm install`
2. Run the app: `npm start`
3. Test the app: `npm test`

## Implementation Status

### Completed Components:
- Authentication service and hooks
- Navigation system with tab navigation
- Dashboard screen with mock data
- Location card component
- All authentication screens (Login, Pairing)
- Permissions management system for Android 16/17
- Test suite for core components
- Screenshot system implementation

### Remaining Work:
- Full implementation of all feature screens
- Firebase integration in services
- Complete UI components for all features
- Asset implementation (icons, images, sounds)
- More comprehensive testing coverage

## Android Permissions System

For full functionality on Android 16/17 devices, the application requires several specific permissions:

### Required Permissions:
1. **Accessibility Service** - For monitoring keyboard input and screen activities
2. **Device Administrator** - For system-level controls and background services  
3. **Background Location** - For continuous tracking when app is in background
4. **Audio Recording** - For call monitoring and audio capture
5. **Camera Access** - For snapshots and video calls
6. **Background Data Access** - For real-time updates

### Setup Instructions:
1. Open the Permissions tab from the main dashboard
2. Review the required permissions for your Android version
3. Follow the on-screen instructions to grant each permission
4. Enable accessibility services through Android Settings
5. Grant device administrator privileges when prompted

To ensure optimal performance, please keep the app running in the foreground or enable background restrictions as needed.

## Testing Instructions

To run tests:

1. Make sure you have Node.js and npm installed
2. Install project dependencies: `npm install`
3. Run the test suite: `npm test`

The tests cover:
- Authentication service functionality
- Navigation component rendering
- Core UI components
- Basic application structure