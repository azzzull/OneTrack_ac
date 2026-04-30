/**
 * Global Channel Manager for Supabase Realtime
 *
 * This singleton ensures:
 * - Unique channel names per user session
 * - Proper cleanup using supabase.removeChannel()
 * - Prevention of duplicate subscriptions
 * - Race condition handling
 *
 * PRODUCTION IMPORTANT NOTES:
 * - DO NOT use .unsubscribe() - it only stops receiving events but keeps the channel registered
 * - ALWAYS use supabase.removeChannel() to properly remove channels
 * - ALWAYS call cleanupAllChannels() before creating new channels to prevent duplicate subscriptions
 * - ALWAYS use unique channel names with user ID to prevent cross-user subscription issues
 */

import supabase from "../supabaseClient";

// Singleton instance
let channelManagerInstance = null;

// Track if we're in a logged-out state to prevent race conditions
let isLoggedOut = false;

/**
 * Mark user as logged out - call this on logout to prevent race conditions
 */
export function markUserLoggedOut() {
    isLoggedOut = true;
}

/**
 * Mark user as logged in - call this on login to enable subscriptions
 */
export function markUserLoggedIn() {
    isLoggedOut = false;
}

/**
 * Check if user is in logged out state
 * @returns {boolean}
 */
export function isUserLoggedOut() {
    return isLoggedOut;
}

/**
 * @typedef {Object} ChannelConfig
 * @property {string} name - Channel name (without user ID)
 * @property {string|null} userId - User ID for scope
 * @property {Function} callback - Callback function
 * @property {Object} filter - Supabase filter config
 */

/**
 * Get or create the channel manager singleton
 */
export function getChannelManager() {
    if (!channelManagerInstance) {
        channelManagerInstance = new RealtimeChannelManager();
    }
    return channelManagerInstance;
}

/**
 * Create a unique channel name with user ID
 * @param {string} baseName - Base channel name
 * @param {string|null} userId - User ID
 * @returns {string} Unique channel name
 */
export function createUniqueChannelName(baseName, userId) {
    if (!userId) {
        // Fallback to timestamp for anonymous/unauthenticated
        return `${baseName}-${Date.now()}`;
    }
    return `${baseName}-${userId}`;
}

/**
 * Cleanup ALL existing channels before creating new ones
 * This prevents the "cannot add postgres_changes callbacks after subscribe()" error
 * @returns {Promise<void>}
 */
export async function cleanupAllChannels() {
    try {
        const channels = supabase.getChannels();

        if (channels && channels.length > 0) {
            console.log(
                `[ChannelManager] Cleaning up ${channels.length} existing channels`,
            );

            // Remove all channels properly
            await Promise.all(
                channels.map((channel) => supabase.removeChannel(channel)),
            );
        }

        console.log("[ChannelManager] All channels cleaned up");
    } catch (error) {
        console.error("[ChannelManager] Error cleaning up channels:", error);
    }
}

/**
 * Create and subscribe to a channel with proper cleanup
 * @param {string} baseName - Base channel name
 * @param {Object} filter - Supabase postgres_changes filter
 * @param {Function} callback - Callback function
 * @param {string|null} userId - User ID for unique naming
 * @returns {Promise<Object|null>} Channel object or null on error
 */
export async function createAndSubscribeChannel(
    baseName,
    filter,
    callback,
    userId,
) {
    // Step 1: Cleanup existing channels first
    await cleanupAllChannels();

    // Step 2: Create unique channel name
    const channelName = createUniqueChannelName(baseName, userId);

    // Step 3: Create and subscribe
    const channel = supabase
        .channel(channelName)
        .on("postgres_changes", filter, callback);

    const { error } = await channel.subscribe();

    if (error) {
        console.error(
            `[ChannelManager] Failed to subscribe to ${channelName}:`,
            error,
        );
        return null;
    }

    console.log(`[ChannelManager] Subscribed to ${channelName}`);
    return channel;
}

/**
 * Check if a channel with the given name already exists
 * @param {string} baseName - Base channel name to search for
 * @returns {boolean}
 */
export function hasExistingChannel(baseName) {
    const channels = supabase.getChannels();
    return channels.some((ch) => ch.topic && ch.topic.includes(baseName));
}

/**
 * Get all channel topics for debugging
 * @returns {string[]}
 */
export function getAllChannelTopics() {
    const channels = supabase.getChannels();
    return channels.map((ch) => ch.topic).filter(Boolean);
}

/**
 * RealtimeChannelManager class
 * For advanced use cases
 */
class RealtimeChannelManager {
    constructor() {
        this.activeChannels = new Map();
        this.pendingSubscriptions = new Set();
    }

    /**
     * Subscribe to a channel with proper lifecycle management
     * @param {string} baseName - Base channel name
     * @param {Object} filter - Supabase filter config
     * @param {Function} callback - Callback function
     * @param {string|null} userId - User ID
     * @returns {Promise<Object|null>}
     */
    async subscribe(baseName, filter, callback, userId = null) {
        const channelKey = createUniqueChannelName(baseName, userId);

        // Prevent duplicate subscriptions
        if (this.pendingSubscriptions.has(channelKey)) {
            console.log(
                `[ChannelManager] Subscription pending for ${channelKey}, skipping`,
            );
            return null;
        }

        // Check if already subscribed
        if (this.activeChannels.has(channelKey)) {
            console.log(
                `[ChannelManager] Channel ${channelKey} already active, reusing`,
            );
            return this.activeChannels.get(channelKey);
        }

        this.pendingSubscriptions.add(channelKey);

        try {
            // Cleanup first
            await cleanupAllChannels();

            const channel = supabase
                .channel(channelKey)
                .on("postgres_changes", filter, callback);

            const { error } = await channel.subscribe();

            if (error) {
                console.error(`[ChannelManager] Subscribe error:`, error);
                return null;
            }

            this.activeChannels.set(channelKey, channel);
            return channel;
        } finally {
            this.pendingSubscriptions.delete(channelKey);
        }
    }

    /**
     * Unsubscribe and remove a specific channel
     * @param {string} baseName - Base channel name
     * @param {string|null} userId - User ID
     */
    async unsubscribe(baseName, userId = null) {
        const channelKey = createUniqueChannelName(baseName, userId);
        const channel = this.activeChannels.get(channelKey);

        if (channel) {
            await supabase.removeChannel(channel);
            this.activeChannels.delete(channelKey);
            console.log(`[ChannelManager] Unsubscribed from ${channelKey}`);
        }
    }

    /**
     * Unsubscribe ALL channels
     */
    async unsubscribeAll() {
        await cleanupAllChannels();
        this.activeChannels.clear();
    }
}

export default {
    getChannelManager,
    createUniqueChannelName,
    cleanupAllChannels,
    createAndSubscribeChannel,
    hasExistingChannel,
    getAllChannelTopics,
};
