import fs from 'fs/promises';
import path from 'path';
import { StorageProvider } from './storage-provider';

export class LocalStorageProvider implements StorageProvider {
  private readonly rootDir: string;

  constructor(rootDir?: string) {
    const defaultRoot = process.env.LOCAL_STORAGE_ROOT || path.join(process.cwd(), 'storage');
    this.rootDir = path.resolve(rootDir || defaultRoot);
  }

  /**
   * Resolve and sanitize a storage key relative to root directory.
   * Throws an error if the key attempts path traversal outside the root directory.
   */
  private resolveKey(key: string): string {
    const absolutePath = path.resolve(this.rootDir, key);
    const relative = path.relative(this.rootDir, absolutePath);

    if (relative.startsWith('..') || path.isAbsolute(relative) || !absolutePath.startsWith(this.rootDir)) {
      throw new Error(`Security Violation: Key "${key}" attempts path traversal outside storage root.`);
    }

    return absolutePath;
  }

  async saveObject(key: string, buffer: Buffer, _contentType?: string): Promise<string> {
    const filePath = this.resolveKey(key);
    const dir = path.dirname(filePath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, buffer);

    return key;
  }

  async readObject(key: string): Promise<Buffer> {
    const filePath = this.resolveKey(key);
    try {
      return await fs.readFile(filePath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Storage Object Not Found: key "${key}"`);
      }
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const filePath = this.resolveKey(key);
    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.resolveKey(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
