import sharp from 'sharp';
import StorageBridge from './StorageBridge.mjs';
import { ListObjectsCommand, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3';


export default class AWSStorage extends StorageBridge {

  constructor(parent) {
    super(parent);
    this.connector = parent.connector;
    this.client = new S3Client({region: 'eu-west-1'});
  }

  static async mint(parent) {
    let instance = new AWSStorage(parent);
    const errorResponse = {
      'headers': {
        'Location': `https://${parent.connector.profile.S3_BUCKET}.s3.amazonaws.com/brokenImage.png`
      },
      'statusCode': 302,
      'isBase64Encoded': false
    };
    return instance;
  }

  async sendS3Request(option) {
    try {
      return await this.client.send(option);
    } catch (e) {return  e}
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

  async get(id, thumbnailOptions) {
    let spec = await super.getSpec(id, thumbnailOptions);
    let test = new GetObjectCommand({Bucket: this.connector.profile.aws.s3_bucket, Key: spec.path})
    let response = await this.sendS3Request(test);

    if (response.$metadata.httpStatusCode !== 200 && Object.keys(thumbnailOptions).length > 0) {

      let mainSpec = await super.getSpec(id);
      let mainTest = new GetObjectCommand({Bucket: this.connector.profile.aws.s3_bucket, Key: mainSpec.path})
      response = await this.sendS3Request(mainTest);

      if (response.$metadata.httpStatusCode === 200) {
        const buffer = await this.streamToBuffer(response.Body)
        let bufferThumbnail = await sharp(buffer,{failOnError: false});
        bufferThumbnail = await spec.process(bufferThumbnail);
        await this.putImage(id, spec.path, 'image/png', bufferThumbnail, false);
        await this.commitThumbnailOnDb(id, thumbnailOptions)
        return await this.get(id, thumbnailOptions)
      } else return null

    }

    if (response.$metadata.httpStatusCode !== 200) return null

    return response.Body;

    // response.Body.pipe(res); // TODO: return response

    //! ________________
    // let buffer = await axios(, {responseType: 'arraybuffer'}); // ! where should i get item ?
    // let image = await sharp(buffer.data);
    // image = await spec.process(image);
    // if (image) {
    //   await this.client.send(new PutObjectCommand({
    //     Bucket: this.connector.profile.aws.s3_bucket,
    //     Key: spec.path,
    //     ContentType: 'image/png',
    //     Body: image
    //   }))
    //   return Buffer.from(image, 'base64');
    //   //!________________
    // } else {
    // return this.notFound(req, res);
    // }

  }

  async remove(id, commitOnDb = true) {
    let spec = await super.getSpec(id);
    const objectsToDelete = [{Key: spec.path}]

    const thumbnails = (await this.collection.findOne({_id: id}))?.thumbnails || []

    for (const thumbnail of thumbnails) {
      const tempSpec = await super.getSpec(id, thumbnail)
      objectsToDelete.push({Key: tempSpec.path})
    }

    let test = new DeleteObjectsCommand({Bucket: this.connector.profile.aws.s3_bucket, Delete: {
        Objects: objectsToDelete,
      }});

    let response = await this.client.send(test);

    const isDeleted = response.$metadata.httpStatusCode === 200;
    if (isDeleted && commitOnDb) await super.remove(id)
    return isDeleted
  }

  async putImage(id, file, fileType, buffer, commitOnDb = true) {
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
    if (commitOnDb) {
      await this.collection.findOneAndUpdate(
          {_id: id},
          {$set: {
            status: StorageBridge.LIVE,
            url: url,
            type: fileType,
            file: file,
            _modified: new Date()
          }}
      );
    }
    return url;
  }

  async commitThumbnailOnDb(id, thumbnail) {
    let mediaItem = await this.collection.findOne({_id: id});

    if (mediaItem) {
      if (mediaItem.thumbnails) {
        const count = mediaItem.thumbnails.filter(item => JSON.stringify(item) === JSON.stringify(thumbnail)).length
        if (count === 0) mediaItem.thumbnails.push(thumbnail)
      } else mediaItem.thumbnails = [thumbnail]
    }

    const res = await this.collection.updateOne({_id: id}, {$set: mediaItem})
    return res.modifiedCount > 0

  }

  streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async rotate(id, rotateDegree) {
    let image = await this.get(id)
    if (!image) return false

    const isDeleted = await this.remove(id, false)
    if (!isDeleted) return false


    image = await this.streamToBuffer(image)

    const buffer = await sharp(image).rotate(rotateDegree).toBuffer()

    const spec = await this.getSpec(id)
    const fileType = 'image/png';

    const thumbnails = (await this.collection.findOne({_id: id}))?.thumbnails || []

    for (const thumbnail of thumbnails) {
      let specForThumbnail = await this.getSpec(id, thumbnail);
      let bufferThumbnail = await sharp(buffer, {failOnError: false});
      bufferThumbnail = await specForThumbnail.process(bufferThumbnail);
      await this.putImage(id, specForThumbnail.path, fileType, bufferThumbnail, false);
    }
    const url = await this.putImage(id, spec.path, fileType, buffer, false)

    return Boolean(url)
  }
}
