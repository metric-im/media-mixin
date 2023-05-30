/**
 * Generic database services for mongo.
 *
 * To disallow access to certain collections, provide
 * middleware that filters /data/:collection
 */
import express from 'express';
import fileUpload from 'express-fileupload';
import Componentry from "@metric-im/componentry";
import Jimp from 'jimp';
import {PutObjectCommand, GetObjectCommand, HeadObjectCommand} from '@aws-sdk/client-s3';
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
  routes() {
    let router = express.Router();
    router.use(fileUpload({ limit: 200 * 1024 * 1024 }));
    router.get('/media/image/url/*', async (req, res) => {
      try {
        res.set('Content-Type', 'image/png');
        let key = crypto.createHash('md5').update(req.params[0]).digest('hex');
        let buffer = await Jimp.read('https://'+req.params[0]);
        let spec = new Spec(key,req.query);
        let image = await spec.process(buffer);
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
        let spec = new Spec(req.params[0],req.query);
        res.set('Content-Type', 'image/png');
        if (item.system === 'aws') {
          try {
            let test = new GetObjectCommand({Bucket:'bluefire','Key':spec.path})
            let response = await this.connector.profile.S3Client.send(test);
            response.Body.pipe(res);
          } catch(e) {
            Jimp.read(item.url,async (error,buffer)=>{
              if (error) throw error;
              let image = await spec.process(buffer);
              let result = await this.connector.profile.S3Client.send(new PutObjectCommand({
                Bucket:this.connector.profile.aws.s3_bucket,
                Key:spec.path,
                ContentType: 'image/png',
                Body: image
              }))
              let data = Buffer.from(image, 'base64');
              res.send(data);
            });
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
      try {
        let mediaItem = await this.collection.findOne({_id:req.params[0]},);
        if (!mediaItem) return res.status(400).send(`${req.params[0]} has not been staged`);
        let buffer = req.files.file.data;
        mediaItem.type = req.files.file.mimetype; // staged type is ignored. It is there for troubleshooting
        let file = `${mediaItem._id}.${mediaItem.type.split('/')[1]}`;
        // Normalize images into PNG and capture initial crop spec
        if (['image/jpeg','image/jpg','image/png','image/bmp','image/gif'].includes(mediaItem.type)) {
          buffer = await Jimp.read(buffer).then(async (image)=>{
            let spec = new Spec(mediaItem._id,req.query);
            image = await spec.process(image);
            mediaItem.type = 'image/png';
            file = `${mediaItem._id}.png`;
            return image;
          })
        }
        if (mediaItem.system === 'aws') {
          let result = await this.connector.profile.S3Client.send(new PutObjectCommand({
            Bucket:this.connector.profile.aws.s3_bucket,
            Key:`media/${file}`,
            ContentType: mediaItem.type,
            Body: buffer
          }))
          let url = `https://${this.connector.profile.aws.s3_bucket}.s3.${this.connector.profile.aws.s3_region}.amazonaws.com/media/${file}`;
          await this.collection.findOneAndUpdate({_id:mediaItem._id},{$set:{status:'live',url:url,type:mediaItem.type,file:file}});
          res.status(200).json({_id:req.params.id,url:url,status:'success'});
        } else if (mediaItem.system === 'storj') {
          res.status(400).send('not implemented');
        }
      } catch (e) {
        console.error(e);
        res.status(500).send();
      }
    })
    return router;
  }
}
class Spec {
  constructor(key,query) {
    this.isEmpty = true;
    this.key = key;
    if (query.crop) {
      let data = query.crop.split(',');
      this.crop = {x:parseInt(data[0]),y:parseInt(data[1]),w:parseInt(data[2]),h:parseInt(data[3])};
      this.isEmpty = false;
    }
    if (query.scale) {
      let data = query.scale.split(',');
      this.scale = {w:parseInt(data[0]),h:parseInt(data[1])};
      this.isEmpty = false;
    }
    if (['contain','cover','resize','scaleToFit'].includes(query.mode)) {
      this.mode = query.mode;
    } else {
      this.mode = 'cover';
    }
  }
  toString() {
    let str = [];
    if (this.scale) str.push(`scale=${this.scale.w},${this.scale.h}`);
    if (this.crop) str.push(`crop=${this.crop.x},${this.crop.y},${this.crop.w},${this.crop.h}`);
    if (this.mode) str.push(`mode=${this.mode}`);
    return str.join('&');
  }
  get path() {
    return 'media/'+this.key+(!this.isEmpty?'.'+this.toString():'')+'.png';
  }
  get rootPath() {
    return 'media/'+this.key+'.png';
  }
  async process(image) {
    return new Promise((resolve, reject) => {
      try {
        if (this.scale) {
          image[this.mode](this.scale.w,this.scale.h);
        }
        if (this.crop) {
          let x = image.bitmap.width * (this.crop.x/100);
          let y = image.bitmap.height * (this.crop.y/100);
          let w = image.bitmap.width * (this.crop.w/100);
          let h = image.bitmap.height * (this.crop.h/100);
          image.crop(x,y,w,h);
        }
        return image.getBuffer(Jimp.MIME_PNG, function (err, img) {
          if (err) reject(err);
          else resolve(img)
        });
      } catch (e) {
        reject(new Error("image processing error: " + e))
      }
    })
  }
}
