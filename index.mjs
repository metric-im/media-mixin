/**
 * Generic database services for mongo.
 *
 * To disallow access to certain collections, provide
 * middleware that filters /data/:collection
 */
import express from 'express';
import Componentry from "@metric-im/componentry";
import Jimp from 'jimp';

export default class MediaMixin extends Componentry.Module {
  constructor(connector) {
    super(connector,import.meta.url)
  }
  routes() {
    let router = express.Router();
    router.get("/media/image/url/*", async (req, res) => {
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
