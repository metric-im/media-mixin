import MediaPresets from "../../components/MediaPresets.mjs";
export default class ImageProcessor {
    constructor(id, options) {
        if (Object.keys(options||[]).length === 0) options = undefined;
        let parts = id.split('.');
        this.id = parts[0];
        this.preset = MediaPresets[parts[1]];
        if (this.preset) options = parts[2] || options || this.preset.options;
        else options = parts[1] || options || {};
        this.spec = Object.fromEntries(new URLSearchParams(options).entries())

        if (this.spec.crop) {
            let data = this.spec.crop.split(',');
            this.prepareCropPayload(data)
        }

        if (this.spec.scale) {
            let data = this.spec.scale.split(',');
            this.prepareScalePayload(data)
        }
    }

    get path() {
        let path = this.id;
        if (this.preset) {
            path += `.${this.preset._id}`;
        } else {
            let str = [];
            if (this.scale) str.push(`scale=${this.scale.width||0},${this.scale.height||0},${this.scale.fit}`);
            if (this.crop) str.push(`crop=${this.crop.left||''},${this.crop.top||''},${this.crop.width||''},${this.crop.height||''}`);
            let spec = str.join('&');
            if (spec) path += `.${spec}`;
        }
        return path+'.png';
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
                let width = this.scale?this.scale.width:metadata.width;
                let height = this.scale?this.scale.height:metadata.height;
                let options = {};
                if (this.crop.left) options.left = Math.round(width * (this.crop.left/100));
                if (this.crop.top) options.top = Math.round(height * (this.crop.top/100));
                if (this.crop.width) options.width = Math.round(width * (this.crop.width/100));
                if (this.crop.height) options.height = Math.round(height * (this.crop.height/100));
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
