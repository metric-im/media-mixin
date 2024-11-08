import { S3Client } from '@aws-sdk/client-s3';
import AWSStorage from "./AWSStorage.mjs";

export default class StorjStorage extends AWSStorage {

    constructor(parent, options = {}) {
        super(parent, options, false);
        this.connector = parent.connector;

        const storjConfig = this.connector.profile.storj.config
        this.bucketName = this.connector.profile.storj.s3_bucket

        this.client = new S3Client(storjConfig)
    }

    static async mint(parent, options) {
        return new StorjStorage(parent, options);
    }
}

