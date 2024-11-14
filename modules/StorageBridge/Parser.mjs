import MediaPresets from "../../components/MediaPresets.mjs";
export default class Parser {
    constructor(root,label,spec,ext) {
        this.cropFromPreset = false
        this.scaleFromPreset = false
        this.isEmpty = true;
        if (typeof spec === 'string') {
            let parts = spec.split('&').map(o=>o.split('='))
            spec = Object.fromEntries(parts);
        }

        if (spec.crop) {
            let data = spec.crop.split(',');
            this.prepareCropPayload(data)
            this.isEmpty = false;
        }

        if (spec.scale) {
            let data = spec.scale.split(',');
            this.prepareScalePayload(data)
            this.isEmpty = false;
        }

        if (spec.label && MediaPresets[spec.label]) {
            let options = Object.fromEntries(new URLSearchParams(MediaPresets[spec.label].options).entries())
            if (options.get('crop')) {
                this.cropFromPreset = true
                let data = options.crop.split(',');
                this.prepareCropPayload(data)
                this.isEmpty = false;
            }
            if (options.get('scale')) {
                this.scaleFromPreset = true
                let data = options.scale.split(',');
                this.prepareScalePayload(data)
                this.isEmpty = false;
            }

        }
    }

    toString() {
        let str = [];
        if (this.preset) str.push(this.preset);
        if (this.scale && !this.scaleFromPreset) str.push(`scale=${this.scale.width||0},${this.scale.height||0},${this.scale.fit}`);
        if (this.crop && !this.cropFromPreset) str.push(`crop=${this.crop.x||''},${this.crop.y||''},${this.crop.width||''},${this.crop.height||''}`);
        return str.join('&');
    }

    get path() {
        const path =  `media/${this.id}${(!this.isEmpty?'.'+this.toString():'')}.png`;
        console.log('PATH', path)
        return path
    }

    get rootPath() {
        return `${this.id}.png`;
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
            return await image.toBuffer();
        } catch (e) {
            throw new Error('image processing error: ' + e.message || e);
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

}
