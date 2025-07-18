import type { ClientUploadsAccess } from '@payloadcms/plugin-cloud-storage/types'
import type { PayloadHandler } from 'payload'

import * as AWS from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import path from 'path'
import { APIError, Forbidden } from 'payload'

import type { EncryptionConfig } from './encryptionParams.js'
import type { S3StorageOptions } from './index.js'

import { getEncryptionParams } from './encryptionParams.js'

interface Args {
  access?: ClientUploadsAccess
  acl?: 'private' | 'public-read'
  bucket: string
  collections: S3StorageOptions['collections']
  encryption?: EncryptionConfig
  getStorageClient: () => AWS.S3
}

const defaultAccess: Args['access'] = ({ req }) => !!req.user

export const getGenerateSignedURLHandler = ({
  access = defaultAccess,
  acl,
  bucket,
  collections,
  encryption,
  getStorageClient,
}: Args): PayloadHandler => {
  return async (req) => {
    if (!req.json) {
      throw new APIError('Content-Type expected to be application/json', 400)
    }

    const { collectionSlug, filename, mimeType } = (await req.json()) as {
      collectionSlug: string
      filename: string
      mimeType: string
    }

    const collectionS3Config = collections[collectionSlug]
    if (!collectionS3Config) {
      throw new APIError(`Collection ${collectionSlug} was not found in S3 options`)
    }

    const prefix = (typeof collectionS3Config === 'object' && collectionS3Config.prefix) || ''

    if (!(await access({ collectionSlug, req }))) {
      throw new Forbidden()
    }

    const fileKey = path.posix.join(prefix, filename)

    const encryptionParams = getEncryptionParams(encryption)

    const url = await getSignedUrl(
      // @ts-expect-error mismatch versions or something
      getStorageClient(),
      new AWS.PutObjectCommand({
        ACL: acl,
        Bucket: bucket,
        ContentType: mimeType,
        Key: fileKey,
        ...encryptionParams,
      }),
      {
        expiresIn: 600,
      },
    )

    return Response.json({ url })
  }
}
