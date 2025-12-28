/**
 * DebugConfig - Central configuration for debug/testing mode features
 * Toggle with 'T' key during gameplay
 */
export const DebugConfig = {
    // Global debug mode enabled/disabled
    enabled: false,

    // Debug features (can be toggled individually)
    features: {
        // Full visibility - see entire world instead of just light radius
        fullVisibility: true,

        // Show light radius indicator - draw circle around player showing light range
        showLightRadius: true,

        // Show player names above their heads
        showPlayerNames: true,

        // Show player IDs and states
        showPlayerInfo: false,

        // Show AI state for bots (FLEE, SEEK_OIL, EXPLORE, etc.)
        showAIStates: false,

        // Show collision boxes
        showCollisionBoxes: false,

        // Invincibility for human player (no oil depletion, no enemy damage)
        godMode: false,

        // Show FPS counter
        showFPS: true,
    },

    // Visual settings for debug mode
    visual: {
        // Light radius indicator color
        lightRadiusColor: 0xffff00,
        lightRadiusAlpha: 0.3,

        // Player name text style
        nameTextStyle: {
            fontSize: '12px',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 2
        },

        // AI state text style
        aiStateTextStyle: {
            fontSize: '10px',
            color: '#00ff00',
            fontStyle: 'normal',
            stroke: '#000000',
            strokeThickness: 2
        },

        // Full visibility ambient light level
        fullVisibilityAmbient: 0xaaaaaa, // Bright gray - makes everything visible
    },

    // Toggle debug mode on/off
    toggle() {
        this.enabled = !this.enabled;
        console.log(`[DebugConfig] Testing mode ${this.enabled ? 'ENABLED' : 'DISABLED'}`);
        return this.enabled;
    },

    // Enable specific feature
    enableFeature(featureName) {
        if (this.features.hasOwnProperty(featureName)) {
            this.features[featureName] = true;
            console.log(`[DebugConfig] Feature enabled: ${featureName}`);
        }
    },

    // Disable specific feature
    disableFeature(featureName) {
        if (this.features.hasOwnProperty(featureName)) {
            this.features[featureName] = false;
            console.log(`[DebugConfig] Feature disabled: ${featureName}`);
        }
    },

    // Check if feature is enabled (only if debug mode is on)
    isFeatureEnabled(featureName) {
        return this.enabled && this.features[featureName];
    }
};
