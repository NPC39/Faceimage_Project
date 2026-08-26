import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
} from '@aws-sdk/client-s3';

import { StorageProvider } from './storage-provider';

export class R2StorageProvider implements StorageProvider {
    private readonly client: S3Client;
    private readonly bucketName: string;

    constructor() {
        const accountId = process.env.R2_ACCOUNT_ID;
        const accessKeyId = process.env.R2_ACCESS_KEY_ID;
        const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
        const bucketName = process.env.R2_BUCKET_NAME;

        if (!accountId) throw new Error('R2_ACCOUNT_ID is required');
        if (!accessKeyId) throw new Error('R2_ACCESS_KEY_ID is required');
        if (!secretAccessKey) throw new Error('R2_SECRET_ACCESS_KEY is required');
        if (!bucketName) throw new Error('R2_BUCKET_NAME is required');

        this.bucketName = bucketName;

        this.client = new S3Client({
            region: 'auto',
            endpoint:
                process.env.R2_ENDPOINT ||
                `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        });
    }

    private normalizeKey(key: string): string {
        const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
        const parts = normalized.split('/');

        if (!normalized || parts.some((part) => part === '..' || part === '.')) {
            throw new Error(`Invalid storage key: "${key}"`);
        }

        return normalized;
    }

    async saveObject(
        key: string,
        buffer: Buffer,
        contentType?: string
    ): Promise<string> {
        const safeKey = this.normalizeKey(key);

        await this.client.send(
            new PutObjectCommand({
                Bucket: this.bucketName,
                Key: safeKey,
                Body: buffer,
                ContentType: contentType || 'application/octet-stream',
            })
        );

        return safeKey;
    }

    async readObject(key: string): Promise<Buffer> {
        const safeKey = this.normalizeKey(key);

        try {
            const response = await this.client.send(
                new GetObjectCommand({
                    Bucket: this.bucketName,
                    Key: safeKey,
                })
            );

            if (!response.Body) {
                throw new Error(`Storage Object Not Found: key "${safeKey}"`);
            }

            const bytes = await response.Body.transformToByteArray();
            return Buffer.from(bytes);
        } catch (error: any) {
            if (
                error?.name === 'NoSuchKey' ||
                error?.$metadata?.httpStatusCode === 404
            ) {
                throw new Error(`Storage Object Not Found: key "${safeKey}"`);
            }

            throw error;
        }
    }

    async deleteObject(key: string): Promise<void> {
        const safeKey = this.normalizeKey(key);

        await this.client.send(
            new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: safeKey,
            })
        );
    }

    async exists(key: string): Promise<boolean> {
        const safeKey = this.normalizeKey(key);

        try {
            await this.client.send(
                new HeadObjectCommand({
                    Bucket: this.bucketName,
                    Key: safeKey,
                })
            );

            return true;
        } catch (error: any) {
            if (
                error?.name === 'NotFound' ||
                error?.$metadata?.httpStatusCode === 404
            ) {
                return false;
            }

            throw error;
        }
    }
}