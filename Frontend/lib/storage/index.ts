import { StorageProvider } from './storage-provider';
import { LocalStorageProvider } from './local-storage-provider';
import { R2StorageProvider } from './r2-storage-provider';

let storageProviderInstance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (storageProviderInstance) {
    return storageProviderInstance;
  }

  const rawProvider = process.env.STORAGE_PROVIDER;
  const isProduction = process.env.NODE_ENV === 'production';

  let providerType: string;

  if (rawProvider) {
    providerType = rawProvider.toLowerCase();
  } else if (!isProduction) {
    providerType = 'local';
  } else {
    throw new Error(
      'STORAGE_PROVIDER environment variable is required in production (expected "local" or "r2").'
    );
  }

  switch (providerType) {
    case 'local':
      storageProviderInstance = new LocalStorageProvider();
      break;

    case 'r2':
      storageProviderInstance = new R2StorageProvider();
      break;

    default:
      throw new Error(
        `Unsupported STORAGE_PROVIDER "${rawProvider}". Expected "local" or "r2".`
      );
  }

  return storageProviderInstance;
}

export * from './storage-provider';
export * from './local-storage-provider';
export * from './r2-storage-provider';