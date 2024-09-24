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
import crypto from 'crypto';
import StorageBridge from './utilities/StorageBridge.mjs';
// import {Binary} from "mongodb";

export default class MediaMixin extends Componentry.Module {
  constructor(connector) {
    super(connector,import.meta.url)
    this.maxImageWidth = parseInt(process.env.IMAGE_MAXWIDTH || "2048");
    this.collection = this.connector.db.collection('media');
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
    instance.storage = await StorageBridge.mint(instance); // an instance established by the environment is returned
    return instance;
  }

  prepareItems(items) {
    const preparedItems = []

    for (const item of items.split(';')) {
      if (item) {
        const [key, val] = item.split(':')
        preparedItems.push({[key]: val})
      }
    }
    return preparedItems
  }

  routes() {
    let router = express.Router();
    router.use(fileUpload({ limits: {fileSize: 50 * 1024 * 1024}}));

    /**
     * List gets all items that match the path.
     */

    router.get('/media/image/list/*',async (req,res)=>{
      try {
        let images = await this.storage.list(req.params[0]);
        // let result = images.map(({data,...washed}) => washed); // remove attributes not inteded for the client
        res.json(images);
      } catch(e) {
        res.send(e.message)
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

    router.get('/media/image/id/*',async (req,res)=> {
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

    router.get('/media/image/rotate/*',async (req,res)=> {
      try {
        const rotateDegree = +req.query?.rotateDegree
        if (!rotateDegree) res.status(400).json({message: 'Set the query param rotateDegree!'})

        const items = this.prepareItems(req.query?.include || [])

        await this.storage.rotate(req.params[0], rotateDegree, items);
        res.status(200).json({});
      } catch (e) {
        console.log(e)
        res.status(500).json({});
      }
    });

    // media-mixin index.js
    router.delete('/media/image/*', async(req,res) => {
      try {
        const id = req.params[0]
        if (!id) res.status(400).json({'message': 'Image id is required'})

        const itemsToDelete = req.query['delete'] || [] // required to delete optimized variants of this image by id
        const preparedItems = this.prepareItems(itemsToDelete)

        const isDeleted = await this.storage.remove(req.params[0], preparedItems);
        if (isDeleted) {
          res.status(200).send();
        } else {
          res.status(400).json({'message': 'Image was not found or unexpected error'})
        }
      } catch(e) {
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
              ContentType: "image/png",
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

    router.get("/media/props/*",async (req,res) => {
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

    router.put("/media/props",async (req,res) => {
      if (!req.account) return res.status(401).send();

      try {
        if (!req.body._id) {
          req.body._id = this.connector.idForge.datedId();
        }
        req.body._modified = new Date();
        let modifier = {
          $set:req.body,
          $setOnInsert:{
            status:"staged",
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

    router.put('/media/upload/*',async (req,res) => {
      if (!req.account) return res.status(401).send();

      try {
        let mediaItem = await this.collection.findOne({_id:req.params[0]},);
        if (!mediaItem) return res.status(400).send(`${req.params[0]} has not been staged`);
        let buffer = req.files.file.data;
        let fileType = req.files.file.mimetype;
        let file = `${mediaItem._id}.${fileType.split('/')[1]}`;

        // Normalize images into PNG and capture initial crop spec
        if (fileType.startsWith("image/")) {
          fileType = 'image/png';

          if (Object.keys(req.query).length === 0) {
            let specForThumbnail = await this.storage.getSpec(mediaItem._id, {scale: '60,60,cover'});
            let bufferThumbnail = await sharp(buffer,{failOnError: false});
            bufferThumbnail = await specForThumbnail.process(bufferThumbnail);
            await this.storage.putImage(mediaItem._id, specForThumbnail.path, fileType, bufferThumbnail);
          }

          let spec = await this.storage.getSpec(mediaItem._id, req.query);
          buffer = await sharp(buffer,{failOnError: false});
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

    router.put('/media/stage/*',async (req,res) => {
      try {
        if (!req.account) return res.status(401).send();

        const server = req.query['query'] || 'aws'

        switch (server) {
          case StorageBridge.AWS:
            const response = await this.collection.insertOne({
              system: StorageBridge.AWS,
              status: 'staged',
              ...req.body
            })
            return res.status(201).json(req.body)
          default:
            return res.status(400).json({message: `The server ${server} is not supported`})
        }
      }
      catch (e) {
        console.log(e)
        return res.status(500)
      }
    });

    router.get('/media/noimage',(req,res)=>{
      res.set("Content-Type","image/gif");
      res.contentLength = 43;
      res.end(this.pixel,'binary');
    })
    return router;

  }
  notFound(req,res) {
    if (req.query.safe) {
      res.set("Content-Type","image/gif");
      res.contentLength = 43;
      res.end(this.pixel,'binary');
    } else {
      res.status(404).send();
    }
  }
}


