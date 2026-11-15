# Screenshot System Documentation

This document describes the screenshot system implemented for the Haven Family Safety Application.

## Overview

The screenshot system provides both automated and manual capabilities to capture screenshots of key application screens during development and usage. This helps with documentation, debugging, and feature verification.

## Features

1. **Manual Screenshot Capture**: Take screenshots on-demand from any screen
2. **Periodic Screenshot Capture**: Automatically capture screenshots at set intervals
3. **Screenshot Management**: List, organize, and clean up screenshots
4. **Metadata Support**: Attach descriptions to screenshots for better organization

## Implementation Details

The screenshot system is implemented in `/src/utils/screenshots/screenshotManager.ts` and provides:

- `captureScreenshot(screenName: string, description?: string)` - Manual capture
- `startPeriodicCapture(intervalMinutes: number, screenNames: string[])` - Automated capture
- `getScreenshotList()` - List all captured screenshots
- `cleanupOldScreenshots(maxCount: number)` - Clean up old screenshots

## Screenshot Intervals (as requested in chat prompt)

The system supports specific interval sequences for detailed documentation:

### Sequence of Intervals:
1. **30 seconds**: Initial testing and quick verification
2. **1 minute**: Regular monitoring during active development  
3. **90 seconds (1.5 minutes)**: Mid-development documentation
4. **4 minutes**: Ongoing documentation with reduced frequency

### Usage Example for Specific Intervals:
```typescript
import { setupSpecificIntervalScreenshots } from '../utils/screenshots/periodicScreenshotSetup';

// Start the specific interval sequence
const stopCapture = setupSpecificIntervalScreenshots();
// Captures will automatically transition through the intervals
```

## Standard Periodic Capture (30 minutes)
- **Purpose**: General documentation and verification during development
- **Screens Captured**: Dashboard, WhatsApp, Phone Calls, Instagram, Snapchat
- **Frequency**: Every 30 minutes
- **Use Case**: Regular monitoring of core application functionality

## Intensive Development Capture (5 minutes)  
- **Purpose**: Active development testing and debugging
- **Screens Captured**: All main screens including Login and Pairing
- **Frequency**: Every 5 minutes
- **Use Case**: During active feature development and testing

## Milestone Documentation (15 minutes)
- **Purpose**: Key milestone documentation during development
- **Screens Captured**: Dashboard, WhatsApp, Phone Calls only
- **Frequency**: Every 15 minutes
- **Use Case**: Important development milestones and feature completions

## Usage Examples

### Manual Capture

```typescript
import { ScreenshotManager } from '../utils/screenshots/screenshotManager';

const screenshotManager = ScreenshotManager.getInstance();

// Capture a screenshot of the current screen
await screenshotManager.captureScreenshot('WhatsAppScreen', 'Main WhatsApp monitoring view');
```

### Periodic Capture (30 minutes)

```typescript
import { setupPeriodicScreenshots } from '../utils/screenshots/periodicScreenshotSetup';

// Start taking screenshots every 30 minutes of key screens
const stopCapture = setupPeriodicScreenshots();

// Later, to stop periodic capture:
stopCapture();
```

## Screenshot Storage

Screenshots are stored in:
- Android: `/storage/emulated/0/Pictures/HavenScreenshots`
- Other platforms: `./screenshots`

Each screenshot includes:
1. A PNG image file with timestamp in the filename
2. A metadata JSON file with description and additional information

## Integration Points

The screenshot system is designed to be integrated at key points in the application:

1. **Feature Completion**: Take screenshots when implementing new features
2. **Testing Phases**: Capture before and after testing scenarios
3. **Milestone Documentation**: Save screenshots at major development milestones
4. **Debugging Sessions**: Capture screens during troubleshooting

## Configuration

The system can be configured through:
- `intervalMinutes`: How often to take periodic screenshots (default: 30 minutes)
- `maxCount`: Maximum number of screenshots to keep (default: 50)

## Future Enhancements

1. Integration with native screenshot APIs for actual image capture
2. Cloud storage synchronization for screenshots
3. Web-based screenshot gallery for easy viewing
4. Automatic screenshot naming based on screen content
5. Screenshot comparison tools for feature verification