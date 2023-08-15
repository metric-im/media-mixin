import Componentry from "@metric-im/componentry";
import express from 'express';
export default class Uploader extends Componentry.Module {
    constructor(connector) {
        super(connector);
    }
    routes() {
        let router = express.Router();
        router.put("/media/stage/:system/:source?",async (req,res) => {
            if (!req.account) return res.status(401).send();
            let source = req.params.source || "upload"; // alternative is "url"

            try {
                if (!req.body._id) req.body._id = this.connector.idForge.datedId();

                let ext = req.body.type.split('/')[1]
                let modifier = {
                    $set:{
                        file:req.body._id + '.' + ext,
                        type:req.body.type,
                        size:req.body.size,
                        system:req.params.system,
                        status:"staged",
                        _modified:new Date()
                    },
                    $setOnInsert:{
                        _created:new Date()
                    }
                }
                if (req.body.captured) modifier.$set.captured = req.body.captured;
                if (req.account) modifier.$setOnInsert._createdBy = req.account._id;

                let result = await this.collection.findOneAndUpdate({_id:req.body._id},modifier,{upsert:true});
                res.json({_id:req.body._id,status:'staged'});
            } catch (e) {
                console.error(e);
                res.status(500).send();
            }
        })
        return router;
    }
    async stage(id, options) {

    }
    async push(id,buffer) {

    }
}