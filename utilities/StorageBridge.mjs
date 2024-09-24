/**
 * StorageHandler provides methods for accessing different mechanisms for
 * storing media.
 */
import MediaManipulation from './MediaManipulation.mjs';
import sharp from 'sharp';

export default class StorageBridge {

    static AWS = 'aws'
    static DATABASE = 'database'
    static STORJ = 'storj'

    constructor(parent) {
        this.parent = parent;
        this.host = (process.env.MEDIA_STORAGE || 'aws').toLowerCase();
        this.collection = parent.collection
    }

    static async mint(parent) {
        let instance = new StorageBridge(parent);
        this.handlers = {
            [this.AWS]: "./AWSStorage.mjs",
            [this.DATABASE]: "./DatabaseStorage.mjs",
            [this.STORJ]: null,
        };
        let handler = await import(this.handlers[instance.host])
        return await handler.default.mint(parent);
    }

    async list(account){
        // see inheritors
    }

    async getItem(id) {
        return await this.parent.collection.findOne({_id:id});
    }

    async getSpec(id,options) {
        return new MediaManipulation(id,options);
    }

    async get(id,options) {}

    async putImage(id,image) {}

    async remove(id) {
        await this.parent.collection.deleteOne({_id:id});
    }

    async rotate(id) {
        log.status('shouldnt be here')
        // see inheritors
    }
}

