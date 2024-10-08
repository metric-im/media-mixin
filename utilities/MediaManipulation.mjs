import sharp from "sharp";
import {imagePresets} from "../../../components/Manifest.mjs";

export default class MediaManipulation {
    constructor(id,query) {

        this.cropFromPreset = false
        this.scaleFromPreset = false
        this.isEmpty = true;
        this.id = id;

        if (query?.crop) {
            let data = query.crop.split(',');
            this.prepareCropPayload(data)
            this.isEmpty = false;
        }

        if (query?.scale) {
            let data = query.scale.split(',');
            this.prepareScalePayload(data)
            this.isEmpty = false;
        }

        if (imagePresets.map(item => item._id).includes(query?.preset)) {
            let options = imagePresets.find(item => item._id === query?.preset).options
            options = Object.fromEntries(new URLSearchParams(options).entries())
            this.preset = query.preset

            if (options?.crop) {
                this.cropFromPreset = true
                let data = options.crop.split(',');
                this.prepareCropPayload(data)
                this.isEmpty = false;
            }

            if (options?.scale) {
                this.scaleFromPreset = true
                let data = options.scale.split(',');
                this.prepareScalePayload(data)
                this.isEmpty = false;
            }

            this.isEmpty = false;
        }

    }

    prepareCropPayload(data) {
        this.crop = {};
        if (parseInt(data[0])) this.crop.left = parseInt(data[0]);
        if (parseInt(data[1])) this.crop.top = parseInt(data[1]);
        if (parseInt(data[2])) this.crop.width = parseInt(data[2]);
        if (parseInt(data[3])) this.crop.height = parseInt(data[3]);
    }

    prepareScalePayload(data) {
        this.scale = {};
        if (parseInt(data[0])) this.scale.width = parseInt(data[0]);
        if (parseInt(data[1])) this.scale.height = parseInt(data[1]);
        if (data[2]) this.scale.fit = data[2];
        else this.scale.fit = 'cover';
    }

    toString() {
        let str = [];
        if (this.preset) str.push(this.preset);
        if (this.scale && !this.scaleFromPreset) str.push(`scale=${this.scale.width||0},${this.scale.height||0},${this.scale.fit}`);
        if (this.crop && !this.cropFromPreset) str.push(`crop=${this.crop.x||''},${this.crop.y||''},${this.crop.width||''},${this.crop.height||''}`);
        return str.join('&');
    }
    get path() {
        const res =  `media/${this.id}${(!this.isEmpty?'.'+this.toString():'')}.png`;
        console.log('Path', res)
        return res
    }
    get rootPath() {
        return `media/${this.id}.png`;
    }
    async process(image) {
        try {
            if (this.scale) {
                image.resize(this.scale);
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
            return await image.toBuffer();
        } catch (e) {
            throw new Error('image processing error: ' + e.message || e);
        }
    }
}
