// TypeScript declarations for Sterad API

interface SteradCacheInfo {
  cached: boolean;
  lastCached: string | null;
  size?: number;
  path: string;
}

interface SteradAPI {
  /**
   * Manually trigger caching of the current page
   * @returns Promise that resolves when caching is complete
   */
  triggerCache(): Promise<any>;

  /**
   * Get cache information for the current page
   * @returns Promise that resolves to cache information
   */
  getCacheInfo(): Promise<SteradCacheInfo>;

  /**
   * Check if the current page is cached
   * @returns Promise that resolves to boolean indicating if page is cached
   */
  isCached(): Promise<boolean>;

  /**
   * Get the last cached timestamp for the current page
   * @returns Promise that resolves to Date object or null if not cached
   */
  getLastCached(): Promise<Date | null>;

  /** Internal flag to track manual cache triggering */
  _manualCacheTriggered?: boolean;
}

declare global {
  interface Window {
    Sterad: SteradAPI;
  }
}

export {};
