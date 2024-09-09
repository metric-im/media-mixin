/**
 * StorageHandler provides methods for accessing different mechanisms for
 * storing media.
 */
import MediaManipulation from './MediaManipulation.mjs';
import sharp from 'sharp';

export default class StorageBridge {
    constructor(parent) {
        this.parent = parent;
        this.host = (process.env.MEDIA_STORAGE || 'aws').toLowerCase();
    }
    static async mint(parent) {
        let instance = new StorageBridge(parent);
        this.handlers = {
            aws:AWSStorage,
            database:DatabaseStorage,
            storj:null
        };
        const handler = this.handlers[instance.host]
        return await handler.mint(parent);
    }
    async list(account){
        // see inheritors
    }
    async getItem(id) {
        return await this.parent.collection.findOne({_id:id});
    }
    async getSpec(id,options) {
        return new MediaManipulation(id,options);
    }
    async get(id,options) {

    }
    async putImage(id,image) {

    }
    async remove(id) {
        await this.parent.collection.deleteOne({_id:id});
    }
    async rotate(id) {
        log.status('shouldnt be here')
        // see inheritors
    }
}
class AWSStorage extends StorageBridge {
    constructor(parent) {
        super(parent);
        this.connector = parent.connector;
    }
    static async mint(parent) {
        let instance = new AWSStorage(parent);
        this.aws = await import("@aws-sdk/client-s3");
        const errorResponse = {
            "headers": {
                "Location": `https://${parent.connector.profile.S3_BUCKET}.s3.amazonaws.com/brokenImage.png`
            },
            "statusCode": 302,
            "isBase64Encoded": false
        };
        return instance;
    }
    async list(account) {
        let prefix = `media/${account}`;
        let test = new this.aws.ListObjectsCommand({
            Bucket:this.connector.profile.aws.s3_bucket,
            Prefix:prefix
        })
        let response = await this.connector.profile.S3Client.send(test);
        let ids = new Set();
        for (let record of response.Contents||[]) {
            let id = record.Key.slice(record.Key.lastIndexOf('/')+1,record.Key.indexOf('.'));
            ids.add(id);
        }
        return Array.from(ids);
    }
    async get(id,options) {
        let spec = await super.getSpec(id, options);
        try {
            let test = new this.aws.GetObjectCommand({Bucket: this.connector.profile.aws.s3_bucket, 'Key': spec.path})
            let response = await this.connector.profile.S3Client.send(test);
            response.Body.pipe(res); //TODO: return response
        } catch (e) {
            let buffer = await axios(item.url, {responseType: 'arraybuffer'});
            let image = await sharp(buffer.data);
            image = await spec.process(image);
            if (image) {
                await this.connector.profile.S3Client.send(new this.aws.PutObjectCommand({
                    Bucket: this.connector.profile.aws.s3_bucket,
                    Key: spec.path,
                    ContentType: "image/png",
                    Body: image
                }))
                return Buffer.from(image, 'base64');
            } else {
                return this.notFound(req, res);
            }
        }
    }
    async putImage(id,file,fileType,buffer) {
        // When the source image changes, delete prior variants, so they are reconstructed.
        let variants = await this.connector.profile.S3Client.send(new this.aws.ListObjectsCommand({
            Bucket: this.connector.profile.aws.s3_bucket,
            Prefix: `media/${mediaItem._id}`,
        }));
        if (variants.Contents && variants.Contents.length > 0) {
            await this.connector.profile.S3Client.send(new this.aws.DeleteObjectsCommand({
                Bucket: this.connector.profile.aws.s3_bucket,
                Delete: {Objects: variants.Contents}
            }));
        }
        // Post the new object
        let result = await this.connector.profile.S3Client.send(new this.aws.PutObjectCommand({
            Bucket: this.connector.profile.aws.s3_bucket,
            Key: `media/${file}`, // for image === spec.path
            ContentType: fileType,
            Body: buffer
        }))

        let url = `https://${this.connector.profile.aws.s3_bucket}.s3.${this.connector.profile.aws.s3_region}.amazonaws.com/media/${file}`;
        await this.collection.findOneAndUpdate(
            {_id: mediaItem._id},
            {$set: {status: 'live', url: url, type: fileType, file: file}}
        );
        return url;
    }
}
class DatabaseStorage extends StorageBridge {
    constructor(parent) {
        super(parent);
    }
    static async mint(parent) {
        return new DatabaseStorage(parent);
    }
    async list(account) {
        let search = new RegExp(`^${account}\/`)
        let query = {_id: {"$regex":`^${account}/`}};
        let list = await this.parent.collection.find(query).toArray();
        return list;
    }
    async get(id,options) {
        let spec = await super.getSpec(id,options);
        let item = await this.getItem(id);
        let image = await sharp(Buffer.from(item.data,'base64'));
        image = await spec.process(image);
        return image;
    }
    async putImage(id,file,fileType,buffer) {
        let data = buffer.toString('base64');
        await this.parent.collection.findOneAndUpdate(
            {_id: id},
            {$set: {status: 'live', type: fileType, file: file, data: data,variants:[]}}
        );
    }
    async rotate(id) {
        let item = await this.getItem(id);
        if (!item) return null;
        let image = await sharp(Buffer.from(item.data,'base64'));
        let rotated = await image.rotate(90);
        let buffer = await rotated.toBuffer();
        await this.putImage(id,item.file,item.fileType,buffer);
    }
}
