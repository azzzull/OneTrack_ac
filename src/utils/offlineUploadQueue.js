/**
 * Offline Upload Queue Manager
 * Manages photos that failed to upload due to no internet connection
 * Stores them in localStorage and provides methods to manage the queue
 */

const QUEUE_STORAGE_KEY = 'offline_upload_queue';
const QUEUE_MAX_ITEMS = 5;

/**
 * Initialize queue from localStorage
 * @returns {Array} Array of queued items
 */
export const initializeQueue = () => {
  try {
    const queue = localStorage.getItem(QUEUE_STORAGE_KEY);
    return queue ? JSON.parse(queue) : [];
  } catch (error) {
    console.error('Failed to initialize queue:', error);
    return [];
  }
};

/**
 * Get all queued photos
 * @returns {Array} Array of queued photos
 */
export const getQueuedPhotos = () => {
  return initializeQueue();
};

/**
 * Add photo to offline queue
 * @param {File} file - Photo file object
 * @param {string} folderName - Folder name in Supabase (e.g., "requests/123/after")
 * @param {Object} metadata - Additional metadata (requestId, photoType, userId, etc.)
 * @returns {string} Queue item ID
 */
export const addToQueue = async (file, folderName, metadata = {}) => {
  try {
    const queue = initializeQueue();
    
    // Check queue limit
    if (queue.length >= QUEUE_MAX_ITEMS) {
      throw new Error(`Queue is full. Maximum ${QUEUE_MAX_ITEMS} photos allowed. Please upload some photos first.`);
    }

    // Convert file to base64 for storage
    const fileData = await fileToBase64(file);

    const queueItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fileData, // base64 encoded file
      fileName: file.name,
      fileType: file.type,
      folderName,
      metadata,
      timestamp: Date.now(),
      retries: 0,
      status: 'pending', // pending, uploading, failed
      errorMessage: null,
    };

    queue.push(queueItem);
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));

    console.log(`[OfflineQueue] Added item ${queueItem.id} to queue. Queue size: ${queue.length}`);
    return queueItem.id;
  } catch (error) {
    console.error('Failed to add photo to queue:', error);
    throw error;
  }
};

/**
 * Remove item from queue (after successful upload)
 * @param {string} queueId - Queue item ID
 * @returns {boolean} Success flag
 */
export const removeFromQueue = (queueId) => {
  try {
    let queue = initializeQueue();
    const initialLength = queue.length;
    queue = queue.filter(item => item.id !== queueId);

    if (queue.length < initialLength) {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
      console.log(`[OfflineQueue] Removed item ${queueId}. Queue size: ${queue.length}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to remove item from queue:', error);
    return false;
  }
};

/**
 * Update queue item status
 * @param {string} queueId - Queue item ID
 * @param {Object} updates - Fields to update (status, retries, errorMessage, etc.)
 * @returns {boolean} Success flag
 */
export const updateQueueItem = (queueId, updates) => {
  try {
    let queue = initializeQueue();
    const itemIndex = queue.findIndex(item => item.id === queueId);

    if (itemIndex === -1) {
      console.warn(`[OfflineQueue] Item ${queueId} not found in queue`);
      return false;
    }

    queue[itemIndex] = { ...queue[itemIndex], ...updates };
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    return true;
  } catch (error) {
    console.error('Failed to update queue item:', error);
    return false;
  }
};

/**
 * Clear entire queue
 */
export const clearQueue = () => {
  try {
    localStorage.removeItem(QUEUE_STORAGE_KEY);
    console.log('[OfflineQueue] Queue cleared');
  } catch (error) {
    console.error('Failed to clear queue:', error);
  }
};

/**
 * Convert File to base64 string
 * @param {File} file - File object
 * @returns {Promise<string>} Base64 encoded file
 */
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Convert base64 back to File object
 * @param {string} base64 - Base64 encoded file
 * @param {string} fileName - Original file name
 * @returns {File} File object
 */
export const base64ToFile = (base64, fileName) => {
  const arr = base64.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }
  return new File([u8arr], fileName, { type: mime });
};

/**
 * Get queue statistics
 * @returns {Object} Queue stats (totalItems, pendingCount, failedCount, totalSize)
 */
export const getQueueStats = () => {
  const queue = initializeQueue();
  const stats = {
    totalItems: queue.length,
    pendingCount: queue.filter(item => item.status === 'pending').length,
    failedCount: queue.filter(item => item.status === 'failed').length,
    uploadingCount: queue.filter(item => item.status === 'uploading').length,
  };
  return stats;
};
