import sharp from 'sharp';
import Index from './index.mjs';
import { ListObjectsCommand,PutObjectCommand,GetObjectCommand,DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3';

export default class AWSStorage extends Index {

  constructor(parent, options = {}) {
    super(parent, options);
    this.connector = parent.connector;
    this.initClient();
  }
  initClient() {
    this.bucketName = this.connector.profile.aws.s3_bucket
    this.client = new S3Client({region:this.connector.profile.aws.s3_region});
  }

  static async mint(parent, options) {
    let instance = new AWSStorage(parent, options);
    const errorResponse = {
      'headers': {
        'Location': `https://${parent.connector.profile.S3_BUCKET}.s3.amazonaws.com/brokenImage.png`
      },
      'statusCode': 302,
      'isBase64Encoded': false
    };
    return instance;
  }

  async list(account) {
    let prefix = `media/${account}`;
    let test = new ListObjectsCommand({
      Bucket: this.bucketName,
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
    let test = new GetObjectCommand({Bucket: this.bucketName, Key: spec.path})
    let response = await this.sendS3Request(test);

    if (response.$metadata.httpStatusCode !== 200 && Object.keys(options).length > 0) {

      let mainSpec = await super.getSpec(id);
      let mainTest = new GetObjectCommand({Bucket: this.bucketName, Key: mainSpec.path})
      response = await this.sendS3Request(mainTest);

      if (response.$metadata.httpStatusCode === 200) {
        const buffer = await this.streamToBuffer(response.Body)
        let optimizedBuffer = await sharp(buffer,{failOnError: false});
        optimizedBuffer = await spec.process(optimizedBuffer);
        await this.putImage(id, spec.path, 'image/png', optimizedBuffer);
        return await this.get(id, options)
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

  async putImage(id, file, fileType, buffer) {
    // When the source image changes, delete prior variants, so they are reconstructed.
    let variants = this.client.send(new ListObjectsCommand({
      Bucket: this.bucketName,
      Prefix: `media/${id}`,
    }));
    if (variants.Contents && variants.Contents.length > 0) {
      await this.client.send(new DeleteObjectsCommand({
        Bucket: this.bucketName,
        Delete: {Objects: variants.Contents}
      }));
    }

    // Post the new object
    let response = await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: file, // for image === spec.path
      ContentType: fileType,
      Body: buffer
    }))

    if (response.$metadata.httpStatusCode === 200) {
      await this.collection.deleteOne({_id: id})
    }

    let url = `https://${this.connector.profile.aws.s3_bucket}.s3.${this.connector.profile.aws.s3_region}.amazonaws.com/media/${file}`;
    return url;
  }

  async sendS3Request(option) {
    try {
      return await this.client.send(option);
    } catch (e) {return  e}
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

    image = await this.streamToBuffer(image)
    const buffer = await sharp(image).rotate(rotateDegree).toBuffer()

    const spec = await this.getSpec(id)
    const fileType = 'image/png';

    const isDeleted = await this.remove(id)
    if (!isDeleted) return false
    const url = await this.putImage(id, spec.path, fileType, buffer)

    return Boolean(url)
  }

  async getImages(id) {
    let spec = await super.getSpec(id);
    const prefix = spec.path.slice(0, spec.path.lastIndexOf('.'));

    const listCommand = new ListObjectsCommand({
      Bucket:  this.bucketName,
      Prefix: prefix,
    });
    const listResponse = await this.client.send(listCommand);

    return listResponse.Contents;
  }

  async remove(id) {
    let objectsToDelete = await this.getImages(id)
    if (!objectsToDelete) return false
    objectsToDelete = objectsToDelete.map(item => ({Key: item.Key}))

    let test = new DeleteObjectsCommand({Bucket: this.bucketName, Delete: {
        Objects: objectsToDelete,
      }});

    let response = await this.client.send(test);
    return response.$metadata.httpStatusCode === 200;
  }
}
