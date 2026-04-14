/**
 * useOfflineUpload - React hook for offline-first photo uploads
 * Manages queuing, uploading, and syncing of photos when offline
 */

import { useEffect, useState, useCallback } from 'react';
import {
  getQueuedPhotos,
  addToQueue,
  removeFromQueue,
  updateQueueItem,
  base64ToFile,
  getQueueStats,
} from '../utils/offlineUploadQueue';

export const useOfflineUpload = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queuedPhotos, setQueuedPhotos] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => {
      console.log('[useOfflineUpload] Online');
      setIsOnline(true);
      // Trigger sync when online
      triggerSync();
    };

    const handleOffline = () => {
      console.log('[useOfflineUpload] Offline');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Listen for Service Worker messages
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const handleSWMessage = (event) => {
      if (event.data.type === 'SYNC_OFFLINE_UPLOADS') {
        console.log('[useOfflineUpload] Sync message from SW');
        triggerSync();
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
  }, []);

  // Refresh queued photos list
  const refreshQueuedPhotos = useCallback(() => {
    const queued = getQueuedPhotos();
    setQueuedPhotos(queued);
    console.log('[useOfflineUpload] Queue refreshed:', queued.length, 'items');
  }, []);

  // Initial load of queued photos
  useEffect(() => {
    refreshQueuedPhotos();
  }, [refreshQueuedPhotos]);

  /**
   * Upload a single photo to Supabase
   * @param {File} file - Photo file
   * @param {string} folderName - Folder path in storage
   * @param {Object} supabaseClient - Supabase client
   * @param {string} uploadPath - Full path for upload (e.g., "job-photos/userId/requests/123/after/1234567890.jpg")
   * @returns {Promise<string>} URL of uploaded photo
   */
  const uploadPhotoToStorage = async (file, folderName, supabaseClient, uploadPath) => {
    try {
      const { data, error } = await supabaseClient.storage
        .from('job-photos')
        .upload(uploadPath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      // Get public URL
      const { data: publicData } = supabaseClient.storage
        .from('job-photos')
        .getPublicUrl(uploadPath);

      return publicData.publicUrl;
    } catch (error) {
      console.error(`[useOfflineUpload] Upload failed for ${uploadPath}:`, error);
      throw error;
    }
  };

  /**
   * Retry upload with exponential backoff
   * @param {string} queueId - Queue item ID
   * @param {Object} queueItem - Queue item data
   * @param {Object} supabaseClient - Supabase client
   * @param {Function} onUploadSuccess - Callback when upload succeeds
   * @returns {Promise<boolean>} Success flag
   */
  const retryUploadWithBackoff = async (
    queueId,
    queueItem,
    supabaseClient,
    onUploadSuccess
  ) => {
    const maxRetries = 3;
    const backoffDelays = [1000, 5000, 10000]; // 1s, 5s, 10s

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Wait before retry
          const delay = backoffDelays[attempt - 1];
          console.log(`[useOfflineUpload] Waiting ${delay}ms before retry ${attempt}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Update status to uploading
        updateQueueItem(queueId, { status: 'uploading', retries: attempt });
        setUploadProgress(prev => ({ ...prev, [queueId]: 0 }));

        // Convert base64 back to File
        const file = base64ToFile(queueItem.fileData, queueItem.fileName);

        // Call the upload function (we'll pass this as parameter from component)
        const uploadPath = `${queueItem.metadata.userId}/${queueItem.folderName}/${Date.now()}.jpg`;
        const photoUrl = await uploadPhotoToStorage(
          file,
          queueItem.folderName,
          supabaseClient,
          uploadPath
        );

        // Success! Call the callback to update database
        await onUploadSuccess(queueItem.metadata, photoUrl);

        // Remove from queue
        removeFromQueue(queueId);
        setUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[queueId];
          return newProgress;
        });

        console.log(`[useOfflineUpload] Successfully uploaded ${queueId}`);
        refreshQueuedPhotos();
        return true;
      } catch (error) {
        console.error(`[useOfflineUpload] Attempt ${attempt + 1} failed:`, error);
        
        if (attempt === maxRetries - 1) {
          // Last attempt failed
          updateQueueItem(queueId, {
            status: 'failed',
            retries: maxRetries,
            errorMessage: error.message,
          });
          return false;
        }
      }
    }

    return false;
  };

  /**
   * Sync all queued photos
   * @param {Object} supabaseClient - Supabase client
   * @param {Function} onUploadSuccess - Callback when each photo uploads successfully
   */
  const triggerSync = useCallback(
    async (supabaseClient, onUploadSuccess) => {
      if (isSyncing || !isOnline) {
        console.log('[useOfflineUpload] Skipping sync - isSyncing:', isSyncing, 'isOnline:', isOnline);
        return;
      }

      setIsSyncing(true);
      const queued = getQueuedPhotos();

      console.log('[useOfflineUpload] Starting sync for', queued.length, 'photos');

      for (const queueItem of queued) {
        // Only retry items that are pending or failed
        if (queueItem.status !== 'pending' && queueItem.status !== 'failed') {
          continue;
        }

        const success = await retryUploadWithBackoff(
          queueItem.id,
          queueItem,
          supabaseClient,
          onUploadSuccess
        );

        if (!success) {
          console.warn('[useOfflineUpload] Failed to upload', queueItem.id);
        }

        // Add small delay between uploads to avoid server overload
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      setIsSyncing(false);
      refreshQueuedPhotos();
    },
    [isSyncing, isOnline]
  );

  /**
   * Queue a photo for offline upload
   * @param {File} file - Photo file
   * @param {string} folderName - Folder name (e.g., "requests/123/after")
   * @param {Object} metadata - Metadata to store with the photo
   * @returns {Promise<string>} Queue ID
   */
  const queuePhoto = useCallback(
    async (file, folderName, metadata) => {
      try {
        const queueId = await addToQueue(file, folderName, metadata);
        refreshQueuedPhotos();
        return queueId;
      } catch (error) {
        console.error('[useOfflineUpload] Failed to queue photo:', error);
        throw error;
      }
    },
    []
  );

  /**
   * Upload a photo immediately (or queue if offline)
   * @param {File} file - Photo file
   * @param {string} folderName - Folder name
   * @param {Object} metadata - Photo metadata
   * @param {Object} supabaseClient - Supabase client
   * @param {Function} onUploadSuccess - Callback on success
   * @returns {Promise<{success: boolean, url?: string, queueId?: string}>}
   */
  const uploadPhoto = useCallback(
    async (file, folderName, metadata, supabaseClient, onUploadSuccess) => {
      if (!isOnline) {
        // Queue for later
        const queueId = await queuePhoto(file, folderName, metadata);
        return {
          success: false,
          queued: true,
          queueId,
          message: 'Offline - photo queued for upload when signal returns',
        };
      }

      try {
        // Upload immediately
        const uploadPath = `${metadata.userId}/${folderName}/${Date.now()}.jpg`;
        const photoUrl = await uploadPhotoToStorage(
          file,
          folderName,
          supabaseClient,
          uploadPath
        );

        // Update database via callback
        await onUploadSuccess(metadata, photoUrl);

        return {
          success: true,
          url: photoUrl,
        };
      } catch (error) {
        // Failed to upload, queue it
        const queueId = await queuePhoto(file, folderName, metadata);
        return {
          success: false,
          queued: true,
          queueId,
          message: `Upload failed - queued for retry: ${error.message}`,
        };
      }
    },
    [isOnline, queuePhoto]
  );

  /**
   * Manually retry a failed queued photo
   * @param {string} queueId - Queue item ID
   * @param {Object} supabaseClient - Supabase client
   * @param {Function} onUploadSuccess - Callback on success
   */
  const retryFailedPhoto = useCallback(
    async (queueId, supabaseClient, onUploadSuccess) => {
      const queued = getQueuedPhotos();
      const queueItem = queued.find(item => item.id === queueId);

      if (!queueItem) {
        console.error('[useOfflineUpload] Queue item not found:', queueId);
        return false;
      }

      return await retryUploadWithBackoff(
        queueId,
        queueItem,
        supabaseClient,
        onUploadSuccess
      );
    },
    []
  );

  return {
    // State
    isOnline,
    isSyncing,
    queuedPhotos,
    uploadProgress,
    stats: getQueueStats(),

    // Methods
    uploadPhoto,
    queuePhoto,
    triggerSync,
    retryFailedPhoto,
    refreshQueuedPhotos,
  };
};
