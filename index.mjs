/**
 * File storage handler supporting multiple hosting architectures
 */
import express from 'express';
import fileUpload from 'express-fileupload';
import Componentry from '@metric-im/componentry';
import axios from 'axios'
import sharp from 'sharp';
import crypto from 'crypto';
import StorageBridge from './modules/StorageBridge/index.mjs';

export default class MediaMixin extends Componentry.Module {
  constructor(connector) {
    super(connector,import.meta.url)
    this.maxImageWidth = parseInt(process.env.IMAGE_MAXWIDTH || '2048');
    this.setCollection('media');
    this.pixel = new Buffer.from('R0lGODlhAQABAJAAAP8AAAAAACH5BAUQAAAALAAAAAABAAEAAAICBAEAOw==','base64');
  }

  /**
   * Set collection is used to rename the default media collection
   * @param name alternate name to 'media'
   */
  setCollection(name) {
    this.collection = this.connector.db.collection(name);
  }

  static async mint(connector) {
    let instance = new MediaMixin(connector);
    instance.storage = await StorageBridge.mint(instance);
    return instance;
  }

  routes() {
    let router = express.Router();
    router.use(fileUpload({ limits: {fileSize: 50 * 1024 * 1024}}));
    /**
     * List gets all items that match the path.
     */
    router.get('/media/image/list/*',async (req,res) => {
      try {
        let images = await this.storage.list(req.params[0]);
        res.json(images);
      } catch(e) {
        console.error(e);
        res.send(e.message);
      }
    })

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

    router.get('/media/image/id/*',async (req,res) => {
      try {
        let image = await this.storage.get(req.params[0],req.query);
        if (image) {
          res.set('Content-Type', 'image/png');
          image.pipe(res); //TODO: this breaks DatabaseStorage
//          res.send(image);
        }
        else return this.notFound(req,res)
      } catch (e) {
        console.log(e)
        res.status(500).send();
      }
    });

    router.get('/media/image/rotate/*',async (req,res) => {
      try {
        const rotateDegree = +req.query?.rotateDegree
        if (!rotateDegree) res.status(400).json({message: 'Set the query param rotateDegree!'});
        await this.storage.rotate(req.params[0], rotateDegree);
        res.status(200).json({});
      } catch (e) {
        console.log(e)
        res.status(500).json({});
      }
    });

    router.delete('/media/image/*', async(req,res) => {
      try {
        const id = req.params[0]
        if (!id) res.status(400).json({'message': 'Image id is required'})

        const isDeleted = await this.storage.remove(req.params[0]);
        if (isDeleted) {
          res.status(200).send();
        } else {
          res.status(400).json({'message': 'Image was not found or unexpected error'})
        }
      } catch (e) {
        console.log(e)
        res.status(500).send();
      }
    })

    //TODO: this needs work
    router.get('/media/image/import/:id/*', async (req, res) => {
      try {
        const url = decodeURIComponent(req.params[0])

        let key = crypto.createHash('md5').update(url).digest('hex');
        let buffer = await axios('https://'+url,{responseType:'arraybuffer'});
        let spec = new Spec(key,req.query);
        let image = await sharp(buffer.data);
        image = await spec.process(image);
        if (image) {
          if (this.storage.host === 'aws') {
            await this.connector.profile.S3Client.send(new this.aws.PutObjectCommand({
              Bucket:this.connector.profile.aws.s3_bucket,
              Key: spec.path,
              ContentType: 'image/png',
              Body: image
            }))
            let data = Buffer.from(image, 'base64');
            res.send(data);
          } else if (this.storage.host === 'database') {
            // need to insert first.
            let data = Buffer.from(image, 'base64');
            res.send(data);
          } else {
            return res.status(404).send()
          }
        } else {
          return res.status(404).send()
        }
        res.set('Content-Type', 'image/png');
        res.send(image);
      } catch (e) {
        console.error(e);
        res.status(500).send();
      }
    });

    router.get('/media/props/*',async (req, res) => {
      try {
        let item = await this.storage.getItem(req.params[0]);
        if (item) {
          delete item.data;
          return res.json(item);
        }
        else return this.notFound(req,res)
      } catch (e) {
        res.status(500).send();
      }
    })

    router.put('/media/props',async (req, res) => {
      if (!req.account) return res.status(401).send();

      try {
        if (!req.body._id) {
          req.body._id = this.connector.idForge.datedId();
        }
        req.body._modified = new Date();
        let modifier = {
          $set:req.body,
          $setOnInsert:{
            status:'staged',
            url:this.connector.profile.baseUrl+'/media/image/id/'+req.body._id,
            _created:new Date(),
            _createdBy:req.account.userId
          }
        }
        if (req.body.captured) modifier.$set.captured = new Date(req.body.captured);

        let result = await this.collection.findOneAndUpdate({_id:req.body._id},modifier,{upsert:true});
        res.json({_id:req.body._id,status:req.body.status});
      } catch (e) {
        console.error(e);
        res.status(500).send();
      }
    })

    router.put('/media/stage/:system?',async (req, res) => {
      if (!req.account) return res.status(401).send();
      try {
        let origin = req.body.origin || 'upload'; // alternative is 'url'
        if (!req.body._id) req.body._id = this.connector.idForge.datedId();

        console.log(req.body)

        let ext = req.body.type.split('/')[1]
        let modifier = {
          $set:{
            system:req.params.system,
            origin:origin,
            status:'staged',
            _modified:new Date()
          },
          $setOnInsert:{
            _created:new Date()
          }
        }
        if (origin === 'upload') {
          Object.assign(modifier.$set,{
            file:req.body._id + '.' + ext,
            type:req.body.type,
            size:req.body.size,
          })
        } else if (origin === 'url') {
          Object.assign(modifier.$set,{
            file:req.body._id + '.png',
            type:'image/png',
            url:req.body.url
          })
        }
        if (req.body.captured) modifier.$set.captured = req.body.captured;
        if (req.account) modifier.$setOnInsert._createdBy = req.account.userId;

        let result = await this.collection.findOneAndUpdate({_id:req.body._id},modifier,{upsert:true});
        res.json({_id:req.body._id,status:'staged'});
      } catch (e) {
        console.error(e);
        res.status(500).send();
      }
    })

    router.put('/media/upload/*',async (req, res) => {
      if (!req.account) return res.status(401).send();

      try {
        let mediaItem = await this.collection.findOne({_id: req.params[0]});
        if (!mediaItem) return res.status(400).send(`${req.params[0]} has not been staged`);
        let buffer = req.files.file.data;
        let fileType = req.files.file.mimetype;
        let file = `${mediaItem._id}.${fileType.split('/')[1]}`;

        // Normalize images into PNG and capture initial crop spec
        if (fileType.startsWith('image/')) {
          fileType = 'image/png';
          let spec = await this.storage.getSpec(mediaItem._id, req.query);
          buffer = await sharp(buffer, {failOnError: false});
          buffer = await spec.process(buffer);
          file = spec.path
        }

        await this.storage.putImage(mediaItem._id, file, fileType, buffer);
        res.json({});
      } catch (e) {
        console.error('/media/upload/* error:', e);
        res.status(500).send();
      }
    });

    router.get('/media/noimage',(req, res) => {
      this.notFound(req,res);
    })

    return router;
  }

  notFound(req, res) {
    res.set('Content-Type','image/gif');
    res.contentLength = 43;
    res.end(this.pixel,'binary');
  }
}


