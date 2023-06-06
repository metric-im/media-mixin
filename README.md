# Metric Media Mixin Studio

Blob storage for metric apps. This is optimized for image uploads, but should adapt for all file types.

The module takes a url or local file along with rendering specs if desired. As the request is likely to
be re-issued many times, we store the manipulated data and retrieve it when specs match.

## File Structure and Deployment

* **index.mjs** - entry point for module inclusion
* **app.mjs** - standalone web app (needs to be revisited)
* **profile.mjs** - Should include AWS and StorJ access and any other resources
* **/components/InputFile** - InputFile is a root element that could migrate to common
* **/components/InputImage** the shared page element for rendering and uploading images

## API

The API resides under `/media`. It ingests new objects from a url or local file and serves them to spec.

Uploads are first declared with `/media/stage/[aws|storj]` and then fulfilled with `/media/upload`. Stage
stores the metadata of the file and allows for progress tracking. 

`/media/image/:id` retrieves the image with optional crops and scaling.

### Common Options

When getting or putting a file, options can be provided in the query string. Files are PUT with a
root name, but when the same file is requested with the same options, a copy is saved for efficiency.

These options can be used together. Scale takes precedence for performance.

| name | value                                                                                                                                                                    |
| --- |--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| scale | Absolute pixel width provided as width,height & fit (optional, cover is default). `&scale=900,600`                                                                       |
| crop | Relative cropping, in percents: left, top, width, height. `&crop=20,20,60,60`                                                                                            |

See https://sharp.pixelplumbing.com/. This is the image library in use. "scale" is sharp.resize. "crop" is sharp.extract, after percentages are translared to absolute pixels.

### PUT /media/stage/:system

Declare an upload. This establishes a media record with an ID. The body attributes are:

| name | description                                                                                                                                                                             |
|------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| _id  | The Identifier should be `collection/objectid`. Or props.collection/props.data._id. If left blank, an id is generated. This format ensure uniqueness and organizes the storage structure|
| type | Mime type of the file                                                                                                                                                                   |
| size | Byte size of the file                                                                                                                                                                   |
| captured | (optional) The creation date of the original file when uploaded locally                                                                                                             |

This is recorded in the `media` collection of the database

### PUT /media/upload/:id

`id` must match a currently staged upload file. The route expects a body object with files declared.
It only processes one file as currently implemented. Once the upload is complete the file is written
to the storage system with the given ID and mime-type extension. The database record is updated from
'staged' to 'live'

### GET /media/image/id/:id

The given request, id and options, is searched and returned if available, or rendered based on the original upload.

### GET /media/image/url/:url

`url` is any url, not including the protocol string. The url will be fetched, modified if requested and stored
with a hashed id in the `/media` root folder. The hashed id can be used to retrieve the same request without
new processing.

>NOTE: this is not entirely implemented.

## Examples

From a host component:
```javascript
import Componentry from '@metric-im/componentry';
import CommonMixin from '@metric-im/common-mixin';
import MediaMixin from '../metric-im/media-mixin/index.mjs';
import InputImage from "./InputImage.mjs";

let componentry = new Componentry(app,await Profile());
await componentry.init(MediaMixin,CommonMixin);

this.inputImage = await this.draw(InputImage,{
  data:this.item,
  collection:'publisher',
  name:"icon",
  title:"icon",
  options:"scale=400,400"
},this.element);
```
>NOTE: For prerelease integration, componentry elements can be referenced with a relative path

Collection and options are optional. "Collection" provides a preface to the image path.
"Options" allows the original image to be processed before being saved as the root path.

collection / data._id will be the media object id. So if data._id is "asdf"...

```http request
/media/publisher/asdf
```

and if modifications are required...

```http request
/media/publisher/asdf?scale=900,600
```

## NOTES

* we need to delete all renderings associated with a root file when the origin is re-uploaded
