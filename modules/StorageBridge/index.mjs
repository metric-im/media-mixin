/**
 * StorageHandler provides methods for accessing different mechanisms for
 * storing media.
 */
import Parser from './Parser.mjs';
import sharp from 'sharp';
export default class StorageBridge {
    static AWS = 'aws'
    static DATABASE = 'database'
    static STORJ = 'storj'

    static LIVE = 'live'
    static STAGED = 'staged'

    constructor(parent, options) {
        this.parent = parent;
        this.host = (process.env.MEDIA_STORAGE || StorageBridge.AWS).toLowerCase();
        this.collection = parent.collection
        this.imagePresets = options?.imagePresets || {}
    }
    static async mint(parent, options) {
        let instance = new StorageBridge(parent, options);
        this.handlers = {
            [this.AWS]:"./AWSStorage.mjs",
            [this.DATABASE]:"./DatabaseStorage.mjs",
            [this.STORJ]:"./StorjStorage.mjs",
        };
        let handler = await import(this.handlers[instance.host])
        return await handler.default.mint(parent, options);
    }
    async list(account){
        // see inheritors
    }
    async getItem(id) {
        return await this.parent.collection.findOne({_id:id});
    }
    async getSpec(id, options) {
        let parts = id.split('.');
        let key = parts[0];
        let spec = (parts.length > 2)?parts[1]:options;
        let [root,label] = key.split('~');
        let ext = parts.pop();
        return new Parser(root, label, spec, ext);
    }
    async get(id, options) {

    }
    async putImage(id, image) {

    }
    async remove(id) {
        await this.parent.collection.deleteOne({_id:id});
    }
    async rotate(id) {
        console.log("shouldn't be here")
        // see inheritors
    }
}

