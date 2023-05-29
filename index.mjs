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
    router.get('/media/image/id/*',async (req,res)=> {
      try {
        let item = await this.collection.findOne({_id:req.params[0]});
        if (!item) res.status(404).send();
        let cropId = this.getImageCropId(Object.assign({},item.options,req.query));
        res.set('Content-Type', 'image/png');
        if (item.system === 'aws') {
          try {
            let test = new GetObjectCommand({Bucket:'bluefire','Key':`media/${req.params.id}.${cropId}.${item.type}`})
            let response = await this.connector.profile.S3Client.send(test);
            response.Body.pipe(res);
          } catch(e) {
            Jimp.read(item.url,async (error,buffer)=>{
              if (error) throw error;
              let spec = await this.processSpec(buffer,req.query);
              let image = await this.processBuffer(buffer,spec);
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
    router.put("/media/stage/:system/:id?",async (req,res) => {
      try {
        let id = req.body._id;
        if (!id) id = req.params.id || this.connector.idForge.datedId();
        let ext = req.body.type.split('/')[1]
        let fileId = id + "." + ext;
        let modifier = {
          $set:{
            type:ext.toLowerCase(),
            file:fileId,
            type:req.body.type,
            size:req.body.size,
            captured:req.body.captured,
            system:req.params.system,
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
        let buffer = req.files.file.data;
        let file = `${mediaItem._id}.${mediaItem.type}`;
        mediaItem.type = req.files.file.mimetype; // staged type is ignored. It is there for troubleshooting
        // Normalize images into PNG and capture initial crop spec
        if (['image/jpeg','image/jpg','image/png','image/bmp','image/gif'].includes(mediaItem.type)) {
          buffer = await Jimp.read(buffer).then(async (image)=>{
            let spec = this.processSpec(req.query);
            image = await this.processImage(image,spec)
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
          res.status(200).json({_id:req.params.id,status:'success'});
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

  /**
   * Normalize the query string parameters into a consistent object
   * @param options
   * @returns {{mode: string, scale: any, crop: *}}
   */
  processSpec(options={}) {
    if (options.mode && !['contain','cover'].includes(options.mode)) options.mode = null;
    let spec = {
      crop:options.crop, // left %, top %, width %, height %
      scale:options.scale, // width , height
      mode:options.mode || 'cover' // contain or cover
    };
    return spec;
  }

  /**
   * Construct a url safe string from the spec object for use in the file name qualifier
   * @param spec
   * @returns {string}
   */
  serializeSpec(spec) {
    let str = [];
    for (let [key,value] of Object.entries(spec)) {
      str.push(encodeURIComponent(key)+"="+encodeURIComponent(value||''))
    }
    return str.join('&');
  }

  /**
   * Parse the serialized spec into an object for image processing.
   * @param str
   */
  deserializeSpec(str) {
    let up =  new URLSearchParams(str);
    let spec = {
      crop:up.get('crop'),
      scale:up.get('scale'),
      mode:up.get('mode')
    }
    if (spec.crop) {
      let data = spec.crop.split(',');
      spec.crop.x = data[0];
      spec.crop.y = data[1];
      spec.crop.w = data[2];
      spec.crop.h = data[3];
    }
    if (spec.scale) {
      let data = spec.scale.split(',');
      spec.scale.w = data[0];
      spec.scale.h = data[1];
    }
  }

  /**
   * Apply image adjustments from the given spec.
   * @param image
   * @param spec
   * @returns {Promise<unknown>}
   */
  async processImage(image, spec) {
    return new Promise((resolve, reject) => {
      try {
        if (spec.scale) {
          image.scaleToFit(spec.scale.w,spec.scale.h);
        }
        if (spec.crop) {
          let x = image.bitmap.width * (spec.crop.x/100);
          let y = image.bitmap.height * (spec.crop.y/100);
          let w = image.bitmap.width * (spec.crop.w/100);
          let h = image.bitmap.height * (spec.crop.h/100);
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
