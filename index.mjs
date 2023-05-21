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
import {PutObjectCommand,CreateBucketCommand} from '@aws-sdk/client-s3';

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
        res.set('Content-Type', 'image/jpg');
        let buffer = await Jimp.read('https://'+req.params[0]);
        let spec = await this.processSpec(buffer,req.query);
        let image = await this.processBuffer(buffer,spec);
        res.send(image);
      } catch (e) {
        console.error(e);
        res.status(500).send();
      }
    });
    router.get('/media/image/id/:id',async (req,res)=> {
      try {
        res.set('Content-Type', 'image/jpg');
        let item = await this.collection.findOne({_id:req.params.id});
        if (!item) res.status(404).send();
        if (item.server === 'aws') {
          let buffer = await Jimp.read(item.url);
          let spec = await this.processSpec(buffer,req.query);
          let image = await this.processBuffer(buffer,spec);
          res.send(image);
        } else if (item.server === 'storj') {
          res.status(400).send("not implemented")
        } else res.json(item);
      } catch (e) {
        console.error(e);
        res.status(500).send();
      }
    })
    router.put("/media/stage/:server/:id?",async (req,res) => {
      try {
        let id = req.body._id;
        if (!id) id = req.params.id || this.connector.idForge.datedId();
        let ext = req.body.type.split('/')[1]
        let fileId = id + "." + ext;
        let modifier = {
          $set:{
            type:ext,
            file:fileId,
            size:req.body.size,
            captured:req.body.captured,
            server:req.params.server,
            status:"staged",
            _modified:new Date()
          },
          $setOnInsert:{
            _id:id,
            _created:new Date()
          }
        }
        if (req.account) modifier.$setOnInsert._createdBy = req.account._id;
        let result = await this.collection.findOneAndUpdate({_id:id},modifier,{upsert:true});
        res.json({_id:id,status:'staged'});
      } catch (e) {
        console.error(e);
        res.status(500).send();
      }
    })

    router.put('/media/upload/:id',async (req,res)=>{
      try {
        let mediaItem = await this.collection.findOne({_id:req.params.id},);
        if (!mediaItem) return res.status(400).send(`${req.params.id} has not been staged`);
        if (mediaItem.server === 'aws') {
          let result = await this.connector.profile.S3Client.send(new PutObjectCommand({
            Bucket:this.connector.profile.aws.s3_bucket,
            Key:`media/${mediaItem.file}`,
            Body: req.files.file.data
          }))
          await this.collection.updateOne({_id:mediaItem._id},{$set:{status:'live',url:'https://'}})
          res.status(200).json({_id:req.params.id,status:'success'});
        } else if (mediaItem.server === 'storj') {

        }
      } catch (e) {
        console.error(e);
        res.status(500).send();
      }
    })
    return router;
  }
  async processSpec(buffer,options={}) {
    // if the spec includes position, it's absolute, otherwise it's relative
    let spec = {
      top:options.top?parseInt(options.top):0,
      left:options.left?parseInt(options.left):0,
      height: options.height?parseInt(options.height):buffer.bitmap.height,
      width: options.width?parseInt(options.width):buffer.bitmap.width
    };
    if (typeof options.left === "undefined") {
      let imgRatio = buffer.bitmap.height / buffer.bitmap.width;
      let cropRatioH = spec.height / spec.width;
      let cropRatioW = spec.width / spec.height;
      if (imgRatio < cropRatioH) {
        let cropX = cropRatioW * buffer.bitmap.height;
        let cropOut = buffer.bitmap.width - cropX;
        spec = {top: 0, left: cropOut / 2, height: buffer.bitmap.height, width: cropX, resizeWidth: spec.width};
      } else {
        let cropY = cropRatioH * buffer.bitmap.width;
        let cropOut = buffer.bitmap.height - cropY;
        spec = {left: 0, top: cropOut / 2, width: buffer.bitmap.width, height: cropY, resizeWidth: spec.width};
      }
    }
    return spec;
  }

  async processBuffer(buffer, spec) {
    return new Promise((resolve, reject) => {
      try {
        let newImage = buffer.clone();
        newImage.crop(spec.left, spec.top, spec.width, spec.height);
        if (spec.resizeWidth) newImage.resize(spec.resizeWidth, Jimp.AUTO);
        return newImage.getBuffer(Jimp.MIME_PNG, function (err, img) {
          if (err) reject(err);
          else resolve(img)
        });
      } catch (e) {
        reject(new Error("image processing error: " + e))
      }
    })
  }
}
