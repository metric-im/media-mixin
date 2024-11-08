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
        let instance = new StorjStorage(parent, options);
        const errorResponse = {
            'headers': {
                'Location': `https://${parent.connector.profile.S3_BUCKET}.s3.amazonaws.com/brokenImage.png`
            },
            'statusCode': 302,
            'isBase64Encoded': false
        };
        return instance;
    }
}

