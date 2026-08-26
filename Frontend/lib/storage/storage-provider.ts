export interface StorageProvider {
  /**
   * Save a buffer to storage under the given key.
   * @param key Safe relative storage key (e.g., events/123/456/original.jpg)
   * @param buffer Raw file bytes
   * @param contentType Optional MIME type
   * @returns The storage key under which the object was saved
   */
  saveObject(key: string, buffer: Buffer, contentType?: string): Promise<string>;

  /**
   * Read object bytes from storage for the given key.
   * @param key Safe relative storage key
   * @returns Raw file buffer
   */
  readObject(key: string): Promise<Buffer>;

  /**
   * Delete object from storage for the given key.
   * @param key Safe relative storage key
   */
  deleteObject(key: string): Promise<void>;

  /**
   * Check if object exists in storage for the given key.
   * @param key Safe relative storage key
   */
  exists(key: string): Promise<boolean>;
}
