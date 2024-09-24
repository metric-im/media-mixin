import sharp from "sharp";

export default class MediaManipulation {
    constructor(id,query) {

        this.isEmpty = true;
        this.id = id;
        console.log(query)

        if (query?.crop) {
            let data = query.crop.split(',');
            this.crop = {};
            if (parseInt(data[0])) this.crop.left = parseInt(data[0]);
            if (parseInt(data[1])) this.crop.top = parseInt(data[1]);
            if (parseInt(data[2])) this.crop.width = parseInt(data[2]);
            if (parseInt(data[3])) this.crop.height = parseInt(data[3]);
            this.isEmpty = false;
        }

        if (query?.scale) {
            let data = query.scale.split(',');
            this.scale = {};
            if (parseInt(data[0])) this.scale.width = parseInt(data[0]);
            if (parseInt(data[1])) this.scale.height = parseInt(data[1]);
            if (data[2]) this.scale.fit = data[2];
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
