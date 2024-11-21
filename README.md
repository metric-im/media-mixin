# Metric Media Mixin Studio

Blob storage for metric apps. This is currently optimized for image uploads, but should adapt
for all file types.

PUT an image by providing a local file upload or an online url. The image is assigned an id
and stored in the configured storage system. It is then retrieved with the id through GET.
The request can include image manipulation specifications, such as cropping or scaling. These
alterations are applied before returning the image. The rendering is saved back to storage
as a new file qualified with the requested specs. If the same rendering is requested again,
we return the previously saved file for efficiency and speed. 

> **NOTE**: This documentation is ahead of the current implementation. It introduces some
> new syntax and storage models. This message will be removed when the code matches the spec.
> The basic mechanisms are unchanged.

## Use cases

### Store an image used for an ad campaign across networks
The same image will have different rendering specs depending on the display target.
For example, Facebook expects images to be 960x600, Outbrain wants 640x480, the
system console wants icons sized to 50x50.

Facebook, Outbrain and Icon are all considered labelled variants of the original
rendered to the default spec established in the components/MediaPresets.mjs. When asked
for the "facebook" variant you get the original auto-cropped and sized to fit 960x600.
Override MediaPresets.mjs to extend or alter the standard presets.

Note that once a network is referred an image url (as done when a campaign is created),
they make a copy and never return the source provided.

### Customize the rendering spec for an image
The defaults can be manually modified by dragging or zooming a box
with the same aspect ratio around the original image.
This custom sizing overrides the default. You can also request custom rendering for
the original image, thus creating an unlabelled variant.

### List all items in an account
Get an array of media item id's for the given account. A user wil only be able
to list and access files in an account for which they have read access.

There is no case for listing all files known across accounts that need be
exposed. Only a sys admin would do this for the purposes of backup or such.

### Delete a file
Remove the original and all variants of an item from storage

### Rotate an image
Rotate the source image ninety degrees left or right. All variants will need
to be re-rendered. This should be done on demand, as if the source image were newly
updated.

### Update an image or file
This is a rare case, but needs to be available. A new image is uploaded with the
same id as the original. All variants are deleted. They will be rerendered when
first requested after the update.

This is different from deleting a file and replacing with a new one as the identity
is maintained. Image id's may travel outside our system. For example, id of the image
used in a campaign ad will be referenced in the campaign link hosted by a network.
That id enables us to too track the impact of a specific image as usage data comes
back to us, either through our own data or from foreign sources such as Google Analytics
or Facebook stats.

## Usage
The mechanics of uploading and retrieving files is handled by the chosen
[Storage Bridge](/#StorageBridge). The storage bridge implements the atomic
CRUD operations, create, read, update, delete. The storage bridge is
identified with an environment variable. The default is "aws".

### Upload File
Uploading a file is a two-step process. First the file is staged with /stage, creating an id and
upload key. Then the file is uploaded with /upload. Upload is monitored to show progress to the
end user.

Images should all be cast to PNG format. If process.env.MEDIA_MAXWIDTH is defined, the image
should be sized accordingly before being saved. 

> *NOTE*: We are currently concerned only with images, but should expect other file
> types over time. The API should be segmented to accommodate the needs of different
> file types. We only document the /image requests here.

> *syntax*: `PUT /media/stage`
> *syntax*: `PUT /media/upload/{fileKey}`

Body contains the file mime type, file size, origin ("upload" or "url") and server
credentials. Returns a generated id. Initiate the upload with this id. The imported
package, express-fileupload, handles progress notifications.

| name | description                                                                                                                                                                             |
|------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| _id  | The Identifier should be `collection/objectid`. Or props.collection/props.data._id. If left blank, an id is generated. This format ensure uniqueness and organizes the storage structure|
| type | Mime type of the file                                                                                                                                                                   |
| size | Byte size of the file                                                                                                                                                                   |
| origin | 'upload' or 'url'|
| captured | (optional) The creation date of the original file when uploaded locally                                                                                                             |

The file key is a combination of the account name and the generated image identifier
(accountId/imageId). The account is used manage all files in an account. In AWS S3
this translates to a bucket

### Import Url
Same result as uploading a file except the media source is not the local system but a
publicly accessible URL.

> *syntax*: `PUT /media/import/{url}[?options]`

### Get a Image File

> *syntax*: `GET /media/image/id/{id}[?options]`

Retrieve a file from storage and send it to the client according to the file's mimetype.
Use options to alter the image rendering. For example, `?scale=400,400`. The storage
system may store this rendering so the same spec needn't be re-rendered to re-deliver.

### Get a Image From a URL
> *syntax*: `GET /media/image/url/{id}[?options]`

The purpose of fetching an image url through the media-mixin is to automatically size
it for the target display. Unlike import url, the image is not saved. It is fetched,
manipulated and delivered to the client in one step.

### Rotate an Image
> *syntax*: `GET /media/image/rotate/{id}/{degrees}

Rotate the original image the *degrees* given. As with any update to a known image,
variations of the original are deleted. They will be generated on request as normal.

## Media Manipulation Options

When getting or putting a file, options can be provided in the query string. Files are PUT with a
root name, but when the same file is requested with the same options, a copy is saved for efficiency.

These options can be used together. Scale takes precedence for performance.

| name | value                                                                                                                                                               |
| --- |---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| scale | Absolute pixel width provided as width,height & fit (optional, cover is default). `&scale=900,600`. `*` can be used to float width while setting height             |
| crop | Relative cropping, in percents: left, top, width, height. `&crop=20,20,60,60`                                                                                       |
| fit | Same as object-fit in css. Values are cover, contain, fill, inside or outside. Cover is the default. The value is ignored if both height and width are not provided |
See https://sharp.pixelplumbing.com/. This is the image library in use. "scale" is sharp.resize. "crop" is sharp.extract, after percentages are translated to absolute pixels.

### List Images
> *syntax*: `GET /media/list/{accountId}`

Return image ID's for all source images recorded to the given account.

## <a src="#StorageBridge"></a>Storage Bridge
Three storage bridges have been declared: aws, database, and storj. The chosen bridge is
provided with the environment variable, MEDIA_STORAGE. Only one bridge can be utilized
for an installation.

Storage implementations are found in `/modules/StorageBridge`. Each bridge inherits from Index
which selects the bridge and establishes a common interface.

* list(account)
* getItem(id)
* get(id,options)
* putImage(id,image)
* remove(id)
* rotate(id)

### AWS Storage Bridge
This is the default and most robust bridge. It is implemented on top of S3.

As is a file system, S3 has limited capacity for search and meta data, but
is fully adequate for our needs. We initially implemented a media item in
S3 as a file with a corresponding record in the media collection. This
proved to be unnecessary and more fragile as the file system and database
system needed to stay in sync to represent the media items under management.


### Database Storage Bridge
The database bridge stores image binaries in the database. There is a file
size limit of 16M. Use MEDIA_MAXWIDTH to scale large images down to 1024 width
or so.

Database storage is convenient for simple, standalone installations with relatively
small libraries. Meta data and other attributes can be stored directly with the
image in the same record.

### Storj Storage Bridge

Storj is a system of shared and sharded storage resources spread across the
globe on dedicated and personal machines alike.

This bridge is not yet implemented, however, we have previously implemented
an integration with Storj that can be borrowed. See samizdat-media. The npm
package is public.

## Data Structure
Logical structure

| attribute | description                                                                   |
|-----------|-------------------------------------------------------------------------------|
| id        | the unique identifier of the media item. System generated alphnumeric string. |
| account | id of the account or collection or bucket in which to store this item |
| type      | mime type of the item                                                         |
| size      | size of the item                                                              |
| created   | the date this item was uploaded                                               |
| captured  | the date this item was captured, optional and only if available               |
| variants  | an array of renders, each with a label for defaults and lookup                |

Most Storage Bridge implementations are/will be file systems with limited options for meta data.
We use a common id structure to overload the file name for easier management and lookup. This
is preferable to having the item's data split across a file system and a database, requiring
continuous synchronization.

### File Names
This is the format used for aws and similar file systems
```text
sprague/lwy82j2yhpbkxpuh[.{label} | .customSpec].png
-------|----------------|---------|------------|---
acct id|    item id        label     options    ext
```
* Acct id (account id), translates to a folder or bucket.
* Item id is the unique id for this file and hosts the original source of the item
* Label is a variant of the source custom rendered to fit the target while improving the visual.
* Options is the same string as the query string that specified the custom rendering. It follows a period. It's optional
* Ext is the item extension derived from the mime-type. It is the string following the last period

tilde and period are used as they are url safe. However, acceptable characters is a trait
of the Storage System. These overloaded ids are rarely used out of context. In
most cases the item is referred to externally by item id alone. We could hash the
options string, but it has not been necessary. On item requests, the options string
is in the query string where many more characters are acceptable.

### Meta Data
When using a file system for storage, additional meta data, if any, should be stored in
a JSON file with the same root id. This simplifies management of the object in a single
system. It is convenient for backup, deletion and other maintenance operations.

Currently, we do not record any meta data. We may soon add back keywords to classify an
image. These keywords would be stored in the json file for that image. For example:
```text
# source image
lwy82j2yhpbkxpuh.png                        
# rendered to the default Facebook spec
lwy82j2yhpbkxpuh.FB.png                     
# rendered to a custom spec for Outbrain
lwy82j2yhpbkxpuh.OB.scale=640,480,cover&crop=20,80,20,0.png
# rendered to the default icon spec
lwy82j2yhpbkxpuh.icon.png                   
# json data relevant to this image
lwy82j2yhpbkxpuh.json                       
```

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
  account:'myAccountName',
  name:"icon",
  title:"icon",
  options:"scale=400,400"
},this.element);
```
>NOTE: For prerelease integration, componentry elements can be referenced with a relative path

account / data._id will be the media object id. So if data._id is "asdf", and account is
myAccountName ...

```http request
/media/myAccountName/asdf
```

and if modifications are required...

```http request
/media/myAccountName/asdf?scale=900,600
```
