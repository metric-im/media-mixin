import sharp from "sharp";
import StorageBridge from "./StorageBridge.mjs";
import { ListObjectsCommand,PutObjectCommand,GetObjectCommand,DeleteObjectsCommand, S3Client } from "@aws-sdk/client-s3";

export default class AWSStorage extends StorageBridge {
  constructor(parent) {
    super(parent);
    this.connector = parent.connector;
    this.client = new S3Client({region:"eu-west-1"});
  }
  static async mint(parent) {
    let instance = new AWSStorage(parent);
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
    let test = new ListObjectsCommand({
      Bucket:this.connector.profile.aws.s3_bucket,
      Prefix:prefix
    })
    let response = await this.client.send(test);
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
      let test = new GetObjectCommand({Bucket: this.connector.profile.aws.s3_bucket, 'Key': spec.path})
      let response = await this.client.send(test);
      return response.Body;
      // response.Body.pipe(res); //TODO: return response
    } catch (e) {
      let buffer = await axios(item.url, {responseType: 'arraybuffer'});
      let image = await sharp(buffer.data);
      image = await spec.process(image);
      if (image) {
        await this.client.send(new PutObjectCommand({
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
    let variants = this.client.send(new ListObjectsCommand({
      Bucket: this.connector.profile.aws.s3_bucket,
      Prefix: `media/${mediaItem._id}`,
    }));
    if (variants.Contents && variants.Contents.length > 0) {
      await this.client.send(new DeleteObjectsCommand({
        Bucket: this.connector.profile.aws.s3_bucket,
        Delete: {Objects: variants.Contents}
      }));
    }
    // Post the new object
    let result = await this.client.send(new PutObjectCommand({
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
