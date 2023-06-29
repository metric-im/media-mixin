/**
 * Generic database services for mongo.
 *
 * To disallow access to certain collections, provide
 * middleware that filters /data/:collection
 */
import express from 'express';
import fileUpload from 'express-fileupload';
import Componentry from "@metric-im/componentry";
import axios from 'axios'
import sharp from 'sharp';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  ListObjectsCommand} from '@aws-sdk/client-s3';
import crypto from "crypto";

export default class MediaMixin extends Componentry.Module {
  constructor(connector) {
    super(connector,import.meta.url)
    this.collection = this.connector.db.collection('media');
    const errorResponse = {
      "headers": {
        "Location": `https://${this.connector.profile.S3_BUCKET}.s3.amazonaws.com/brokenImage.png`
      },
      "statusCode": 302,
      "isBase64Encoded": false
    };
  }
  setCollection(name) {
    this.collection = this.connector.db.collection(name);
  }
  routes() {
    let router = express.Router();
    router.use(fileUpload({ limit: 200 * 1024 * 1024 }));
    router.get('/media/image/url/*', async (req, res) => {
      try {
        const url = decodeURIComponent(req.params[0])

        let key = crypto.createHash('md5').update(url).digest('hex');
        let buffer = await axios('https://'+url,{responseType:'arraybuffer'});
        let spec = new Spec(key,req.query);
        let image = await sharp(buffer.data);
        image = await spec.process(image);

        res.set('Content-Type', 'image/png');
        res.send(image);
      } catch (e) {
        console.error(e);
        res.status(500).send();
      }
    });
    router.get('/media/image/id/*',async (req,res)=> {
      try {
        let item = await this.collection.findOne({_id:req.params[0]});
        if (!item) return res.status(404).send();
        let spec = new Spec(req.params[0], req.query);
        res.set('Content-Type', 'image/png');

        if (item.system === 'aws') {
          try {
            let test = new GetObjectCommand({Bucket:this.connector.profile.aws.s3_bucket,'Key':spec.path})
            let response = await this.connector.profile.S3Client.send(test);
            response.Body.pipe(res);
          } catch(e) {
            let buffer = await axios(item.url,{responseType:'arraybuffer'});
            let image = await sharp(buffer.data);
            image = await spec.process(image);
            if (image) {
              await this.connector.profile.S3Client.send(new PutObjectCommand({
                Bucket:this.connector.profile.aws.s3_bucket,
                Key: spec.path,
                ContentType: "image/png",
                Body: image
              }))
              let data = Buffer.from(image, 'base64');
              res.send(data);
            } else {
              return res.status(404).send()
            }
          }
        } else if (item.system === 'storj') {
          res.status(400).send("not implemented")
        } else res.json(item);
      } catch (e) {
        console.error(e);
        res.status(500).send();
      }
    })
    router.put("/media/stage/:system",async (req,res) => {
      if (!req.account) return res.status(401).send();

      try {
        if (!req.body._id) req.body._id = this.connector.idForge.datedId();
        let ext = req.body.type.split('/')[1]
        let modifier = {
          $set:{
            file:req.body._id + '.' + ext,
            type:req.body.type,
            size:req.body.size,
            system:req.params.system,
            status:"staged",
            _modified:new Date()
          },
          $setOnInsert:{
            _created:new Date()
          }
        }
        if (req.body.captured) modifier.$set.captured = req.body.captured;
        if (req.account) modifier.$setOnInsert._createdBy = req.account._id;

        let result = await this.collection.findOneAndUpdate({_id:req.body._id},modifier,{upsert:true});
        res.json({_id:req.body._id,status:'staged'});
      } catch (e) {
        console.error(e);
        res.status(500).send();
      }
    })

    router.put('/media/upload/*',async (req,res)=>{
      if (!req.account) return res.status(401).send();

      try {
        let mediaItem = await this.collection.findOne({_id:req.params[0]},);
        if (!mediaItem) return res.status(400).send(`${req.params[0]} has not been staged`);

        let buffer = req.files.file.data;
        let file = `${mediaItem._id}.${mediaItem.type.split('/')[1]}`;
        let fileType = req.files.file.mimetype; // staged type is ignored. It is there for troubleshooting

        // Normalize images into PNG and capture initial crop spec
        if (fileType.startsWith("image/")) {
          fileType = 'image/png';
          file = `${mediaItem._id}.png`;

          let spec = new Spec(mediaItem._id, req.query);
          buffer = await sharp(buffer,{failOnError: false});
          buffer = await spec.process(buffer);
        }
        if (mediaItem.system === 'aws') {

          // When the source image changes, delete prior variants, so they are reconstructed.
          let variants = await this.connector.profile.S3Client.send(new ListObjectsCommand({
            Bucket:this.connector.profile.aws.s3_bucket,
            Prefix:`media/${mediaItem._id}`,
          }));
          if (variants.Contents && variants.Contents.length > 0) {
            await this.connector.profile.S3Client.send(new DeleteObjectsCommand({
              Bucket:this.connector.profile.aws.s3_bucket,
              Delete:{Objects:variants.Contents}
            }));
          }
          // Post the new object
          let result = await this.connector.profile.S3Client.send(new PutObjectCommand({
            Bucket:this.connector.profile.aws.s3_bucket,
            Key:`media/${file}`, // for image === spec.path
            ContentType: fileType,
            Body: buffer
          }))

          let url = `https://${this.connector.profile.aws.s3_bucket}.s3.${this.connector.profile.aws.s3_region}.amazonaws.com/media/${file}`;
          await this.collection.findOneAndUpdate(
            {_id:mediaItem._id},
            {$set: {status: 'live', url: url, type: fileType, file: file}}
          );

          res.status(200).json({_id:req.params.id, url:url, status:'success'});
        } else if (mediaItem.system === 'storj') {
          res.status(400).send('not implemented');
        }
      } catch (e) {
        console.error('/media/upload/* error:', e);
        res.status(500).send();
      }
    })
    return router;
  }
  async downloadFile(system, key) {
    if(system === "aws") {
      let test = new GetObjectCommand({Bucket:this.connector.profile.aws.s3_bucket, 'Key': key})
      let response = await this.connector.profile.S3Client.send(test);

      const buffer = await new Promise((resolve, reject) => {
        let data = [];

        response.Body.on('data', (chunk) => data.push(chunk));
        response.Body.on('error', (err) => reject(err));
        response.Body.on('close', () => reject(new Error("Connection closed")));
        response.Body.on('end', () => resolve(Buffer.concat(data)));
      });

      return buffer
    }
  }
}
class Spec {
  constructor(key,query) {
    this.isEmpty = true;
    this.key = key;
    if (query.crop) {
      let data = query.crop.split(',');
      this.crop = {};
      if (parseInt(data[0])) this.crop.left = parseInt(data[0]);
      if (parseInt(data[1])) this.crop.top = parseInt(data[1]);
      if (parseInt(data[2])) this.crop.width = parseInt(data[2]);
      if (parseInt(data[3])) this.crop.height = parseInt(data[3]);
      this.isEmpty = false;
    }
    if (query.scale) {
      let data = query.scale.split(',');
      this.scale = {};
      if (parseInt(data[0])) this.scale.width = parseInt(data[0]);
      if (parseInt(data[1])) this.scale.height = parseInt(data[1]);
      if (parseInt(data[2])) this.scale.fit = parseInt(data[2]);
      else this.scale.fit = 'cover';
      this.isEmpty = false;
    }
  }
  toString() {
    let str = [];
    if (this.scale) str.push(`scale=${this.scale.width||0},${this.scale.height||0},${this.scale.fit}`);
    if (this.crop) str.push(`crop=${this.crop.x||''},${this.crop.y||''},${this.crop.width||''},${this.crop.height||''}`);
    return str.join('&');
  }
  get path() {
    return 'media/'+this.key+(!this.isEmpty?'.'+this.toString():'')+'.png';
  }
  get rootPath() {
    return 'media/'+this.key+'.png';
  }
  async process(image) {
    try {
      if (this.scale) {
        image = await image.resize(this.scale);
      }
      if (this.crop) {
        let metadata = await image.metadata();
        let width = (this.scale.width || metadata.width);
        let height = (this.scale.height || metadata.height);
        let options = {};
        if (this.crop.left) options.left = width * (this.crop.left/100);
        if (this.crop.top) options.top = height * (this.crop.top/100);
        if (this.crop.width) options.width = width * (this.crop.width/100);
        if (this.crop.height) options.height = height * (this.crop.height/100);
        image = await image.extract(options);
      }
      return image.toBuffer();
    } catch (e) {
      throw new Error('image processing error: ' + e.message || e);
    }
  }
}
