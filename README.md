# Samizdat Studio

On demand customized serving for image assets. Studio will serve images tailored to the target environment.

The studio takes an image url and rendering specs. As the request is likely to re-issued many times, we
store the manipulated image using a hash so it needn't be reprocessed.

The capability is useful to open sites such as samizdatonline.org. A simple apikey and origin white-listing
should be enough to secure access.

>NOTE: we may want to give it a unique url.

## File Structure and Deployment

The studio should be a plugin component using componentry. We may initially simply include it with
admin.samizdat.online, but anticipate that it may be easiest if run standalone with its own harness.

* **index.mjs** - entry point for module inclusion
* **app.mjs** - standalone web app
* **server/Studio.mjs** - image manipulation functions
* **profile.mjs** - Should include StorJ access and any other resources

## Studio API

This will return the image sized and scaled to the given width and height
```
https://admin.samizdat.online/api/studio/cdn.cnn.com/cnnnext/dam/assets/221116205801-white-house-file-restricted-large-tease.jpg?crop=200x300
```

This will return the image cropped at 200 by 300 pixels with left at 400 and top at 350 pixels.
By specifying the `position` we force the boxing to be fixed rather than relative to the original image
```
https://admin.samizdat.online/api/studio/cdn.cnn.com/cnnnext/dam/assets/221116205801-white-house-file-restricted-large-tease.jpg?crop=200x300&position=400,350
```

## Notes

This code is incomplete. A hashing a caching mechanism using storj needs to be implemented. Authentication controls
are missing. It is not tested and mey need to be adapted to the specific needs of samizdat.