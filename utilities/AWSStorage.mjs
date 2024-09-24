import sharp from "sharp";
import StorageBridge from "./StorageBridge.mjs";
import { ListObjectsCommand, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, S3Client } from "@aws-sdk/client-s3";
import axios from "axios";
import stream from "stream";

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

  async get(id, options) {
    let spec = await super.getSpec(id, options);
    try {
      let test = new GetObjectCommand({Bucket: this.connector.profile.aws.s3_bucket, Key: spec.path})
      let response = await this.client.send(test);
      return response.Body;
      // response.Body.pipe(res); //TODO: return response
    } catch (e) {
      //! ________________
      // let buffer = await axios(, {responseType: 'arraybuffer'}); // ! where should i get item ?
      // let image = await sharp(buffer.data);
      // image = await spec.process(image);
      // if (image) {
      //   await this.client.send(new PutObjectCommand({
      //     Bucket: this.connector.profile.aws.s3_bucket,
      //     Key: spec.path,
      //     ContentType: "image/png",
      //     Body: image
      //   }))
      //   return Buffer.from(image, 'base64');
      //   //!________________
      // } else {
      // return this.notFound(req, res);
      // }

     return null
    }
  }

  async remove(id, items = []) {
    let spec = await super.getSpec(id);
    const objectsToDelete = [{Key: spec.path}]

    for (const item of items) {
      const tempSpec = await super.getSpec(id, item)
      objectsToDelete.push({Key: tempSpec.path})
    }

    let test = new DeleteObjectsCommand({Bucket: this.connector.profile.aws.s3_bucket, Delete: {
        Objects: objectsToDelete,
      }});

    let response = await this.client.send(test);

    const isDeleted = response.$metadata.httpStatusCode === 200;
    if (isDeleted) await super.remove(id)
    return isDeleted
  }

  async putImage(id, file, fileType, buffer, fixedOnDb = true) {
    console.log(arguments)
    // When the source image changes, delete prior variants, so they are reconstructed.
    let variants = this.client.send(new ListObjectsCommand({
      Bucket: this.connector.profile.aws.s3_bucket,
      Prefix: `media/${id}`,
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
      Key: file, // for image === spec.path
      ContentType: fileType,
      Body: buffer
    }))

    let url = `https://${this.connector.profile.aws.s3_bucket}.s3.${this.connector.profile.aws.s3_region}.amazonaws.com/media/${file}`;
    if (fixedOnDb) {
      await this.collection.findOneAndUpdate(
          {_id: id},
          {$set: {status: 'live', url: url, type: fileType, file: file}}
      );
    }
    return url;
  }

  streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async rotate(id, rotateDegree, items) {
    let image = await this.get(id)
    if (!image) return false

    const isDeleted = await this.remove(id, items)
    if (!isDeleted) return false

    image = await this.streamToBuffer(image);
    const buffer = await  sharp(image).rotate(rotateDegree).toBuffer()

    const spec = await this.getSpec(id)
    const fileType = 'image/png';

    for (const item of items) {
      let specForThumbnail = await this.getSpec(id, item);
      let bufferThumbnail = await sharp(buffer, {failOnError: false});
      bufferThumbnail = await specForThumbnail.process(bufferThumbnail);
      await this.putImage(id, specForThumbnail.path, fileType, bufferThumbnail);
    }
    const url = await this.putImage(id, spec.path, fileType, buffer, false)

    return Boolean(url)
  }
}
